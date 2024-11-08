"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.run = void 0;
const smpp_1 = __importDefault(require("smpp"));
const ethers_1 = require("ethers");
const path_1 = __importDefault(require("path"));
const voipms_1 = require("./voipms");
const logger_1 = require("./logger");
const is_dst_1 = __importDefault(require("is-dst"));
const ioredis_1 = __importDefault(require("ioredis"));
const SMPP_URL = process.env.SMPP_URL || "ssmpp://smpp.voip.ms:3550";
const HTTP_FILE_SHARE_BASE_URL = process.env.HTTP_FILE_SHARE_BASE_URL;
const HTTP_FILE_SHARE_SECRET = process.env.HTTP_FILE_SHARE_SECRET;
const SMPP_SYSTEM_ID = process.env.SMPP_SYSTEM_ID;
const SMPP_PASSWORD = process.env.SMPP_PASSWORD;
const SMPP_TLSKEY = process.env.SMPP_TLSKEY || null;
const SMPP_TLSCERT = process.env.SMPP_TLSCERT || null;
const VOIPMS_USERNAME = process.env.VOIPMS_USERNAME;
const VOIPMS_PASSWORD = process.env.VOIPMS_PASSWORD;
const GHOST_NUMBER = process.env.GHOST_NUMBER;
const voipms = new voipms_1.VoipMs({
    username: VOIPMS_USERNAME,
    password: VOIPMS_PASSWORD,
});
const mkdirp = require('mkdirp');
const SMS_SQLITE3_DATABASE = process.env.SMS_SQLITE3_DATABASE || path_1.default.join(process.env.HOME, '.sms_pipeline', 'sms.db');
const knex = require('knex')({
    client: 'sqlite3',
    connection: {
        filename: SMS_SQLITE3_DATABASE
    }
});
const initializeDatabase = async () => {
    await mkdirp(path_1.default.parse(SMS_SQLITE3_DATABASE).dir);
    const exists = await knex.schema.hasTable('messages');
    if (!exists) {
        await knex.schema.createTable('messages', table => {
            table.increments('id');
            table.string('from');
            table.string('to');
            table.string('message');
            table.string('attachments');
            table.time('time');
        });
    }
};
const insertToDatabase = async (sms) => {
    await knex('messages').insert(Object.assign({}, sms, { attachments: JSON.stringify(sms.attachments || []), time: Math.floor(Date.now() / 1000) }));
};
const redis = new ioredis_1.default(process.env.REDIS_URI || 'redis://localhost:6379');
const connect = () => smpp_1.default.connect({ url: SMPP_URL });
const SMS_OUT_CHANNEL = "sms-out";
const SMS_IN_CHANNEL = "sms-in";
/*
const bind = (session, callback) =>
  session.bind_transceiver(
    {
      system_id: SMPP_SYSTEM_ID,
      password: SMPP_PASSWORD,
    },
    (pdu) => callback(pdu)
  );

const once = (fn) => {
  let done;
  return (...args) => {
    done = true;
    return fn(...args);
  };
};
*/
const sendMMS = async ({ from, to, message, attachments }) => {
    logger_1.logger.info("sending MMS with " + attachments.join(' '));
    const [media1, media2, media3] = attachments;
    const out = {
        did: from,
        dst: to,
        message: message || "",
    };
    if (media1)
        out.media1 = media1;
    if (media2)
        out.media2 = media2;
    if (media3)
        out.media3 = media3;
    const result = await voipms.sendMMS.get(out);
    new Promise((resolve, reject) => {
        setTimeout(resolve, 30000);
    }).then(() => voipms.deleteMMS.get({ id: result.mms }));
    return result;
};
const RETRY_INTERVAL = 3000;
const sendSMPP = async (o, tries = 0) => {
    try {
        const { sms } = await voipms.sendSMS.get({
            did: o.from,
            dst: o.to,
            message: o.message
        });
        try {
            await voipms.deleteSMS.get({
                id: sms
            });
        }
        catch (e) {
            logger_1.logger.error(e);
        }
    }
    catch (e) {
        logger_1.logger.error(e);
        if (tries < 5) {
            await new Promise((resolve) => setTimeout(resolve, 5000));
            return await sendSMPP(o, tries + 1);
        }
        await redis.rpush('sms-in', JSON.stringify({
            from: o.to,
            to: o.from,
            message: '<message failed to send: "' + o.message.substr(0, 20) + '...' + '">'
        }));
    }
};
/*
async function sendSMPP(o) {
  return await new Promise((resolve, _reject) => {
    let {
      from: source_addr,
      to: destination_addr,
      message: short_message,
      retry = 0,
    } = o;
    const session = connect();
    const reject = once((e) => {
      retry++;
      if (retry === 5) {
        redis.lpush(JSON.stringify({
          message: short_message,
          attachments: [],
          from: source_addr,
          to: destination_addr
        })).catch((err) => console.error(err));
        console.log('pushing message back onto stack');
        return resolve();
      }
      setTimeout(
        () =>
          sendSMPP(o)
            .then((v) => resolve(v))
            .catch((err) => _reject(err)),
        RETRY_INTERVAL
      );
    });
    session.on("error", (err) => {
      session.close();
      console.error(err);
    });
    bind(session, (pdu) => {
      if (pdu.command_status !== 0)
        return reject(Error("command_status: " + String(pdu.command_status)));
      session.submit_sm(
        {
          destination_addr,
          source_addr,
          short_message,
        },
        once((pdu) => {
          if (pdu.command_status !== 0)
            return reject(
              Error("command_status: " + String(pdu.command_status))
            );
          resolve(pdu);
          session.close();
        })
      );
    });
  });
}

const checkUserPass = (pdu) => {
  return pdu.system_id === SMPP_SYSTEM_ID && pdu.password === SMPP_PASSWORD;
};

const smsFromPdu = (pdu) => {
  const {
    destination_addr: to,
    source_addr: from,
    short_message: { message },
  } = pdu;
  return {
    from,
    to,
    attachments: [],
    message,
  };
};

const pduHandler = (session, handleSms) => (pdu) => {
  session.send(pdu.response());
  handleSms(smsFromPdu(pdu));
};

const smppHandler = (handleSms) => (session) => {
  session.on("error", (err) => console.error(err));
  session.on("bind_transceiver", (pdu) => {
    if (!checkUserPass(pdu)) {
      session.send(
        pdu.response({
          command_status: smpp.ESME_RBINDFAIL,
        })
      );
      session.close();
      return;
    }
    session.on("deliver_sm", pduHandler(session, handleSms));
    session.on("submit_sm", pduHandler(session, handleSms));
    session.on("enquire_link", (pdu) => session.send(pdu.response()));
    session.send(pdu.response());
  });
};

const startSecureSMPPServer = (handleSms) => {
  const server = smpp.createServer(
    {
      cert: fs.readFileSync(process.env.TLS_CERTIFICATE, "utf8"),
      key: fs.readFileSync(process.env.TLS_PRIVATE_KEY, "utf8"),
    },
    smppHandler(handleSms)
  );
  server.listen(3550, "0.0.0.0");
  return server;
};

const startSMPPServer = (handleSms) => {
  console.log("smpp server starting ...");
  const server = smpp.createServer(smppHandler(handleSms));
  server.listen(2775, "0.0.0.0", (err) => console.error(err));
  return server;
};
*/
const util = require("util");
const fallbackForDID = async (n) => {
    return await redis.get('sms-fallback.' + await redis.get('extfor.' + n));
};
const makeTag = (from, to) => {
    const tag = ethers_1.ethers.BigNumber.from(ethers_1.ethers.utils.solidityKeccak256(["string", "string"], [to, from])).mod(ethers_1.ethers.BigNumber.from(10).pow(4)).toString();
    return padTag(tag);
};
const setTagData = async (tag, from, to) => {
    await redis.set('custom-extension.' + (await redis.get('extfor.' + from)) + '.' + tag, from + to);
    await redis.set('tag.' + tag, from + ':' + to);
};
const getTagData = async (tag) => {
    const data = ((await redis.get('tag.' + tag)) || '').split(':');
    if (!data.length)
        return null;
    const [from, to] = data;
    return [from, to];
};
const padTag = (s) => {
    return '0'.repeat(Math.max(0, 4 - s.length)) + s;
    ;
};
const handleSms = async (sms) => {
    const finalSms = {
        ...sms
    };
    try {
        if (await fallbackForDID(sms.to) === sms.from) {
            let matches = sms.message.match(/tag\s+(.*$)/i);
            if (matches) {
                const tag = matches[1];
                let data = await getTagData(tag);
                if (data && data[0] !== sms.to)
                    data = null;
                return await sendSMPP({ to: sms.from, from: sms.to, message: data ? data.join(':') : 'nothing here ghost' });
            }
            matches = sms.message.match(/(^\w{4})\s+(.*$)/);
            if (matches) {
                const tag = matches[1].toLowerCase();
                const target = await getTagData(tag);
                if (target) {
                    const [from, to] = target;
                    logger_1.logger.info('RELAY OUT (' + (await redis.get('extfor.' + sms.to)) + ':' + tag + ')');
                    return await redis.lpush(SMS_OUT_CHANNEL, JSON.stringify(Object.assign({}, sms, {
                        from: sms.to,
                        to: to,
                        message: matches[2],
                    })));
                }
                else
                    return;
            }
            matches = sms.message.match(/^(\d+)\s+(.*$)/);
            if (matches) {
                logger_1.logger.info('RELAY OUT (' + (await redis.get('extfor.' + sms.to)) + ':' + matches[1] + ')');
                return await redis.lpush(SMS_OUT_CHANNEL, JSON.stringify(Object.assign({}, sms, {
                    from: sms.to,
                    to: matches[1],
                    message: matches[2]
                })));
            }
        }
        logger_1.logger.info("IN (" + sms.from + " => " + sms.to + ")");
        const fallback = await fallbackForDID(sms.to);
        if (fallback) {
            const tag = makeTag(sms.to, sms.from);
            await setTagData(tag, sms.to, sms.from);
            logger_1.logger.info('RELAY IN (' + sms.to + ':' + tag + ')');
            await redis.lpush(SMS_OUT_CHANNEL, JSON.stringify(Object.assign({}, sms, {
                from: sms.to,
                message: '(' + tag + ') ' + sms.message,
                to: fallback
            })));
        }
        await insertToDatabase(sms);
        await redis.rpush(SMS_IN_CHANNEL, JSON.stringify(sms));
    }
    catch (e) {
        logger_1.logger.error(e);
    }
};
const POLL_INTERVAL = 10000;
const moment = require("moment");
const getOffset = () => {
    return ((0, is_dst_1.default)() ? 5 : 5) * 3600;
};
const fromUnix = (unix) => {
    return moment(new Date((unix - getOffset()) * 1000)).format("YYYY-MM-DD HH:mm:ss");
};
const toUnix = (dateString) => {
    return Math.floor(Number(new Date(dateString)) / 1000) + getOffset();
};
const getUnix = () => {
    return Math.floor(Date.now() / 1000);
};
const toArray = (s) => {
    const clone = { ...s };
    const length = Math.max(...Object.keys(s).filter((v) => !isNaN(v)).map(Number));
    clone.length = length;
    return Array.from(clone);
};
const getAttachmentsEventually = async (id, count = 0) => {
    if (count === 10)
        return [];
    const attachments = toArray((await voipms.getMediaMMS.get({ id })).media).filter(Boolean);
    if (attachments.length)
        return attachments;
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL));
    return getAttachmentsEventually(id, count + 1);
};
const pullAttachment = async (url) => {
    return url;
    /*
      const ext = path.parse(url).ext;
      const slot = ethers.utils.hexlify(ethers.utils.randomBytes(32)).substr(2);
      const filename = ethers.utils.solidityKeccak256(['bytes32'], [ '0x' + slot ]).substr(2);
      const fileUrl = HTTP_FILE_SHARE_BASE_URL + '/' + slot.substr(40) + '/' + filename.substr(40) + ext;
      const stream = request.get(url).pipe(request({
        url: fileUrl,
        method: 'PUT',
        headers: {
          Authorization: 'Bearer ' + jwt.sign({}, HTTP_FILE_SHARE_SECRET)
        },
      }));
      await new Promise((resolve, reject) => {
        stream.on('error', (e) => reject(e));
        stream.on('end', () => resolve());
      });
      return fileUrl;
      */
};
const pullAttachments = async (urls) => {
    const result = [];
    for (const url of urls) {
        result.push(await pullAttachment(url));
    }
    return result;
};
//const ln = (v) => ((console.log(require('util').inspect(v, { colors: true, depth: 15 }))), v);
const pollOneMMS = async () => {
    let last = Number(await redis.get("last-time"));
    if (!last || isNaN(last))
        last = getUnix(); // initialize to now
    const now = getUnix();
    const to = Math.min(last + 60 * 60, now);
    const response = await voipms.getMMS.get(({
        type: 1,
        all_messages: 1,
        from: fromUnix(last),
        to: fromUnix(to),
    }));
    const { sms } = response;
    if (sms)
        await sms.reduce(async function pull(r, v, i, ary, count = 0) {
            await r;
            const attachments = await pullAttachments([v.col_media1, v.col_media2, v.col_media3].filter(Boolean)); //(await getAttachmentsEventually(v.id)).filter(Boolean);
            const msg = {
                from: v.contact,
                to: v.did,
                message: v.message,
                attachments,
            };
            if (msg.attachments.length === 0 && msg.message === '') {
                logger_1.logger.info('Must pull again:');
                logger_1.logger.info(util.inspect(msg, { colors: true, depth: 5 }));
                await new Promise((resolve) => setTimeout(resolve, 1500));
                return await pull(r, ((await voipms.getMMS.get({ id: v.id })).sms || {})[0] || {}, i, ary, count + 1);
            }
            if (count === 5)
                return;
            const result = await handleSms(msg).catch((err) => logger_1.logger.error(err));
            if (!msg.attachments.length)
                try {
                    const { status } = await voipms.deleteMMS.get({ id: v.id });
                    if (status !== 'success')
                        await voipms.deleteSMS.get({ id: v.id });
                }
                catch (e) {
                    logger_1.logger.error(e);
                }
            return result;
        }, Promise.resolve());
    await redis.set("last-time", String(to));
};
const startPollingForMMS = async () => {
    while (true) {
        try {
            await pollOneMMS();
        }
        catch (e) {
            logger_1.logger.error(e);
        }
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL));
    }
};
const lodash = require("lodash");
const toString = (s) => (Buffer.isBuffer(s) ? s.toString("utf8") : s);
const mutateCoerceAttachments = (msg) => {
    if (typeof msg.attachments === "object" &&
        Object.keys(msg.attachments).length === 0)
        msg.attachments = [];
    return msg;
};
const flushOne = async (msg) => {
    if (!msg)
        return false;
    const decoded = mutateCoerceAttachments(JSON.parse(toString(msg)));
    logger_1.logger.info("OUT (" + decoded.from + " => " + decoded.to + ")");
    await insertToDatabase(decoded);
    if ((decoded.message || "").length > 160 || decoded.attachments.length)
        await sendMMS(decoded);
    else
        await sendSMPP(decoded);
    return true;
};
const forwardMessage = async (msg) => {
    if (!msg)
        return false;
    const decoded = mutateCoerceAttachments(msg);
    logger_1.logger.info("Relaying message");
    logger_1.logger.info(util.inspect(decoded, { colors: true, depth: 2 }));
    if ((decoded.message || "").length > 160 || decoded.attachments.length)
        await sendMMS(decoded);
    else
        await sendSMPP(decoded);
    return true;
};
const createConsumer = async () => {
    const pop = async () => {
        const item = await redis.lpop(SMS_OUT_CHANNEL);
        try {
            if (item) {
                await flushOne(item);
                await pop();
            }
        }
        catch (e) {
            logger_1.logger.error(e);
        }
    };
    while (true) {
        await pop();
        await new Promise((resolve) => setTimeout(resolve, 1000));
    }
};
async function run() {
    await initializeDatabase();
    createConsumer().catch((err) => logger_1.logger.error(err));
    startPollingForMMS().catch((err) => logger_1.logger.error(err));
    //  await startSMPPServer(handleSms);
    //  await startSecureSMPPServer(handleSms);
}
exports.run = run;
//# sourceMappingURL=pipeline.js.map