#!/usr/bin/env node

import url from "url";
import lodash from "lodash";
import fs from "fs-extra";
import debug from "@xmpp/debug";
import crypto from "crypto";
import path from "path";
import mkdirp from "mkdirp";
import { client, xml } from "@xmpp/client";
import { getTranscript } from "./transcript";
import { spawnSync } from "child_process";
import { BUCKET_NAME, storage } from "./storage";
import { logger } from "./logger";
import { ethers } from "ethers";
import yargs from "yargs";
const serviceaccount = require(process.env.GOOGLE_APPLICATION_CREDENTIALS);
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const voicemailDirectory = process.env.VOICEMAIL_DIRECTORY || '/var/spool/asterisk/voicemail/default';
mkdirp.sync(voicemailDirectory);

const filename = yargs.argv._[0];
const bucketName = (process.env.DOMAIN || 'ghostdial.net').replace(/\./g, '-') + '-voicemail';

const getCallerID = (data) => {
  return data.match(/callerid=(.*)$/m)[1];
};

const toParcel = (extension, messageBasename) => {
  const callerid = getCallerID(fs.readFileSync(path.join(voicemailDirectory, extension, 'INBOX', messageBasename + '.txt'), 'utf8'));
  let did;
  try {
    did = fs.readFileSync(path.join(voicemailDirectory, extension, 'did.txt'), 'utf8').trim();
  } catch (e) {
    logger.error(e);
    did = extension;
  }
  return {
    callerid,
    did,
    extension,
    filepath: path.join(voicemailDirectory, extension, 'INBOX', messageBasename + '.wav'),
    name: messageBasename
  };
};


async function processBox(xmpp, extension) {
  await mkdirp(path.join(voicemailDirectory, extension, 'INBOX'));
  const parcels = lodash.uniqBy(fs.readdirSync(path.join(voicemailDirectory, extension, 'INBOX')), (v) => path.parse(v).name).map((v) => toParcel(extension, path.parse(v).name));
  for (const message of parcels) {
    logger.info('processing ' + message.name + ' for ' + message.extension);
    await getTranscript(message);
    logger.info('got transcript')
    const url = await upload(message);
    message.url = url;
    logger.info('uploaded to ipfs');
    const to = message.did + '@' + process.env.DOMAIN;
    const from = 'voicemail@' + process.env.DOMAIN;
    logger.info(message);
    logger.info({ to, from });
    await xmpp.send(xml('presence', { to, from }));
    await xmpp.send(xml('message', { to, from }, xml('body', {}, 'New voicemail from ' + message.callerid + ':\n' + (message.transcript || '<no transcript could be loaded>'))));
    await xmpp.send(xml('message', { to, from }, [ xml('body', {}, message.url), xml('x', { xmlns: 'jabber:x:oob' }, xml('url', {}, message.pinned)) ]));
  }
}

const getExtensions = () => {
  return fs.readdirSync(voicemailDirectory);
};
  

async function processBoxes(xmpp) {
  const extensions = getExtensions();
  for (const extension of extensions) {
    await processBox(xmpp, extension);
    await cleanBox(extension);
  }
};


async function upload(v) {
  const cwd = process.cwd();
  const { dir, name, ext } = path.parse(v.filepath);
  const bucket = await storage.bucket(BUCKET_NAME);
  const contentType = 'audio/wav';
  const filename = 'filename=' + name + '.wav';
  const contentDisposition = 'attachment';
  const metadata = {
    contentType,
    contentDisposition: contentDisposition + '; ' + filename
  };
  const headers = {
    contentType,
    contentDisposition
  };
  const hash = '0x' + crypto.randomBytes(32).toString('hex');
  const [ file ] = await (bucket as any).upload(v.filepath, {
    destination: hash,
    contentDisposition,
    contentType,
    metadata,
    headers
  });
  return await file.getSignedUrl({ version: 'v2', action: 'read', expires: Date.now()*2, client_email: serviceaccount.client_email } as any);
};

function cleanBox(extension) {
  const files = fs.readdirSync(path.join(voicemailDirectory, extension, 'INBOX'));
  files.forEach((v) => {
    fs.unlinkSync(path.join(voicemailDirectory, extension, 'INBOX', v));
  });
};

export async function run() {
  const xmpp = client({
    service: process.env.DOMAIN,
    resource: 'voicemail',
    username: 'voicemail',
    password: process.env.ROOT_PASSWORD || 'password'
  });
  debug(xmpp, true);
  logger.info('starting xmpp');
  await xmpp.start();
  logger.info('started!');
  while (true) {
    try {
      await processBoxes(xmpp);
    } catch (e) {
      logger.error(e);
    }
    await new Promise((resolve) => setTimeout(resolve, 10000));
  }
}

  
