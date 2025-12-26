"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.run = exports.sendAsteriskCommand = exports.printEndatoResult = void 0;
const debug_1 = __importDefault(require("@xmpp/debug"));
const url_1 = __importDefault(require("url"));
const client_1 = require("@xmpp/client");
const asterisk_manager_1 = __importDefault(require("asterisk-manager"));
const id_1 = __importDefault(require("@xmpp/id"));
//import pipl from "@ghostdial/pipl";
const voipms_1 = require("./voipms");
const fs_extra_1 = __importDefault(require("fs-extra"));
const faxvin_puppeteer_1 = require("faxvin-puppeteer");
const ssh2_1 = require("ssh2");
const subprocesses = __importStar(require("./subprocesses"));
const ioredis_1 = __importDefault(require("ioredis"));
const path_1 = __importDefault(require("path"));
const lodash_1 = __importDefault(require("lodash"));
const endato_1 = require("./endato");
const facebook_recover_puppeteer_1 = __importDefault(require("facebook-recover-puppeteer"));
const openai_api_1 = __importDefault(require("openai-api"));
const logger_1 = require("./logger");
const parsers_1 = require("./parsers");
const crypto_1 = __importDefault(require("crypto"));
const ZGREP_SSH_HOSTNAME = process.env.ZGREP_SSH_HOSTNAME;
const ZGREP_SSH_PORT = process.env.ZGREP_SSH_PORT;
const ZGREP_SSH_IDENTITY = process.env.ZGREP_SSH_IDENTITY ||
    path_1.default.join(process.env.HOME, ".ssh", "id_rsa");
const ZGREP_SSH_USER = process.env.ZGREP_SSH_USER;
const ZGREP_DIR = process.env.ZGREP_DIR;
const VOIPMS_SUBACCOUNT = process.env.VOIPMS_SUBACCOUNT || process.env.VOIPMS_SIP_USERNAME;
const VOIPMS_POP = process.env.VOIPMS_POP || "atlanta1.voip.ms";
const ZGREP_MAX_RESULTS = Number(process.env.ZGREP_MAX_RESULTS || 1000);
const FAXVIN_DEFAULT_STATE = process.env.FAXVIN_DEFAULT_STATE;
const openai = new openai_api_1.default(process.env.OPENAI_API_KEY || "");
const answerQuestion = async (question, to) => {
    const documents = [];
    const context = await redis.get("context." + to);
    if (context)
        documents.push(context);
    else
        documents.push("The year is 2022.");
    let temperature = Number((await redis.get("temperature." + to)) || 0.9);
    if (isNaN(temperature))
        temperature = 0.9;
    const gptResponse = await openai.answers({
        documents,
        question,
        temperature,
        search_model: "davinci",
        model: "davinci",
        examples_context: "The Scarlet Letter by Nathaniel Hawthorne, adulteress Hester Prynne must wear a scarlet A to mark her shame. Her lover, Arthur Dimmesdale, remains unidentified and is wracked with guilt, while her husband, Roger Chillingworth, seeks revenge. The Scarlet Letter's symbolism helps create a powerful drama in Puritan Boston: a kiss, evil, sin, nature, the scarlet letter, and the punishing scaffold. Nathaniel Hawthorne's masterpiece is a classic example of the human conflict between emotion and intellect.",
        examples: [
            [
                "What is the reason women would have to wear a scarlet A embroidered on their clothing in Puritan Boston?",
                "They would wear the scarlet A if they committed adultery.",
            ],
            [
                "What is the surname of the unidentified man who Hester cheated on Roger with?",
                "The unidentified man is named Dimmesdale.",
            ],
            [
                "What should I say to Hester?",
                "Don't worry about the haters. Roger is a trick, and there's no proof adultery is a sin.",
            ],
        ],
        max_tokens: 200,
        stop: ["\n", "<|endoftext|>"],
    });
    await send(gptResponse.data.answers[0], to);
};
const sendResults = async (results, query, to) => {
    const lines = results.split("\n");
    const chunks = lodash_1.default.chunk(lines, 50);
    for (const chunk of chunks) {
        logger_1.logger.info(chunk);
        send("zgrep:" + query + ":" + chunk.join("\n"), to);
        await new Promise((resolve, reject) => setTimeout(resolve, 300));
    }
};
const sendLinkedInResults = async (results, query, to) => {
    const lines = results.split("\n").map((v) => v.substr(v.indexOf("{")));
    const chunks = lodash_1.default.chunk(lines, 50);
    for (const chunk of chunks) {
        send(chunk.join("\n"), to);
        await new Promise((resolve, reject) => setTimeout(resolve, 300));
    }
};
const searchDIDs = async (query) => {
    const processed = (0, parsers_1.piplQueryToObject)(query);
    const result = await voipms_1.VoipMs.fromEnv().searchDIDsUSA.get(processed);
    return (result.dids || []).map((v) => v.did);
};
const orderDID = async (number, sourceDid) => {
    const vms = voipms_1.VoipMs.fromEnv();
    const ext = await redis.get("extfor." + sourceDid);
    const { servers } = await vms.getServersInfo.get();
    const { server_pop } = servers.find((v) => v.server_hostname === (VOIPMS_POP || "atlanta1.voip.ms"));
    const payload = {
        did: number,
        routing: "account:" + VOIPMS_SUBACCOUNT,
        pop: server_pop,
        dialtime: 60,
        cnam: 1,
        billing_type: 1,
    };
    logger_1.logger.info(await vms.orderDID.get(payload));
    const smsPayload = {
        did: number,
        enable: 1,
    };
    logger_1.logger.info(await vms.setSMS.get(smsPayload));
    await redis.set("extfor." + number, ext);
};
const runLinkedIn = (query, to) => {
    const client = new ssh2_1.Client();
    return new Promise(async (resolve, reject) => {
        client.on("error", (e) => {
            client.end();
            reject(e);
        });
        client
            .on("ready", () => {
            logger_1.logger.info("session::remote: opened");
            client.exec('grep -r "' + query + '" ' + process.env.LINKEDIN_DIR + "/*", (err, stream) => {
                if (err) {
                    client.end();
                    return reject(err);
                }
                logger_1.logger.info("session::remote: ran " + query);
                let data = "";
                stream.setEncoding("utf8");
                stream.stderr.setEncoding("utf8");
                stream.stderr.on("data", (data) => logger_1.logger.error(data));
                stream.on("data", (_data) => {
                    sendLinkedInResults(_data, query, to).catch((err) => logger_1.logger.error(err));
                });
                stream.on("close", (code, signal) => {
                    client.end();
                    logger_1.logger.info("session::remote: close");
                    logger_1.logger.info(data);
                    resolve("");
                });
            });
        })
            .connect({
            user: ZGREP_SSH_USER,
            privateKey: await fs_extra_1.default.readFile(ZGREP_SSH_IDENTITY),
            port: ZGREP_SSH_PORT,
            host: ZGREP_SSH_HOSTNAME,
        });
    });
};
const runZgrep = (query, to) => {
    const client = new ssh2_1.Client();
    return new Promise(async (resolve, reject) => {
        client.on("error", (e) => {
            client.end();
            reject(e);
        });
        client
            .on("ready", () => {
            logger_1.logger.info("session::remote: opened");
            client.exec('zgrep -a "' + query + '" ' + ZGREP_DIR + "/*", (err, stream) => {
                if (err) {
                    client.end();
                    return reject(err);
                }
                logger_1.logger.info("session::remote: ran " + query);
                let data = "";
                stream.setEncoding("utf8");
                stream.stderr.setEncoding("utf8");
                stream.stderr.on("data", (data) => logger_1.logger.error(data));
                stream.on("data", (_data) => {
                    logger_1.logger.info(_data);
                    sendResults(_data, query, to).catch((err) => logger_1.logger.error(err));
                });
                stream.on("close", (code, signal) => {
                    client.end();
                    logger_1.logger.info("session::remote: close");
                    logger_1.logger.info(data);
                    resolve("");
                });
            });
        })
            .connect({
            user: ZGREP_SSH_USER,
            privateKey: await fs_extra_1.default.readFile(ZGREP_SSH_IDENTITY),
            port: ZGREP_SSH_PORT,
            host: ZGREP_SSH_HOSTNAME,
        });
    });
};
const runZgrepFull = (query, to) => {
    const client = new ssh2_1.Client();
    return new Promise(async (resolve, reject) => {
        client.on("error", (e) => {
            client.end();
            reject(e);
        });
        client
            .on("ready", () => {
            logger_1.logger.info("session::remote: opened");
            client.exec('zgrep -a "' + query + '" ' + path_1.default.parse(ZGREP_DIR).dir + "/*", (err, stream) => {
                if (err) {
                    client.end();
                    return reject(err);
                }
                logger_1.logger.info("session::remote: ran " + query);
                let data = "";
                stream.setEncoding("utf8");
                stream.stderr.setEncoding("utf8");
                stream.stderr.on("data", (data) => logger_1.logger.error(data));
                stream.on("data", (_data) => {
                    logger_1.logger.info(_data);
                    sendResults(_data, query, to).catch((err) => logger_1.logger.error(err));
                });
                stream.on("close", (code, signal) => {
                    client.end();
                    logger_1.logger.info("session::remote: close");
                    logger_1.logger.info(data);
                    resolve("");
                });
            });
        })
            .connect({
            user: ZGREP_SSH_USER,
            privateKey: await fs_extra_1.default.readFile(ZGREP_SSH_IDENTITY),
            port: ZGREP_SSH_PORT,
            host: ZGREP_SSH_HOSTNAME,
        });
    });
};
const spookyStuff = [
    "don't let them see you",
    "look alive ghost",
    "the cabal?",
    "just a nightmare",
    "boo",
    "happy haunting",
    "disappear #ghost",
];
const talkGhastly = (to) => {
    send(spookyStuff[Math.floor(Math.random() * spookyStuff.length)], to);
};
let xmpp = null;
const from = "dossi@" + process.env.DOMAIN;
const send = (msg, to) => {
    const split = to.split("@");
    if (split.length < 2) {
        split.push(process.env.DOMAIN);
    }
    xmpp.send((0, client_1.xml)("message", { to: split.join("@"), from, id: (0, id_1.default)(), type: "chat" }, (0, client_1.xml)("body", {}, msg)));
};
/*
const ack = (stz) => {
  xmpp.send(xml('message', { to, from, id: xid(), type: 'chat' }, xml('receipt
  */
const twilio = new (require("twilio"))();
const sendPiplImagesForPerson = async (person, i, to) => {
    if ((person.images || []).length) {
        send("IMAGES FOR MATCH " + String(i), to);
        i++;
        await new Promise((resolve, reject) => setTimeout(resolve, 300));
    }
    for (const image of person.images || []) {
        await new Promise((resolve, reject) => setTimeout(resolve, 750));
        send(image.url, to);
        await new Promise((resolve, reject) => setTimeout(resolve, 750));
        xmpp.send((0, client_1.xml)("message", { to, from, id: (0, id_1.default)(), type: "chat" }, (0, client_1.xml)("body", {}, image.url) +
            (0, client_1.xml)("x", { xmlns: "jabber:x:oob" }, (0, client_1.xml)("url", {}, image.url))));
    }
};
const sendPiplImages = async (fromPipl, to) => {
    let i = 0;
    for (const person of fromPipl.possible_persons) {
        await sendPiplImagesForPerson(person, i, to);
        i++;
    }
};
const printPiplResult = async (search, result, to) => {
    if (!result.possible_persons)
        return send("no results found", to);
    result.possible_persons.forEach((v) => {
        delete v["@search_pointer"];
    });
    const summary = { ...result };
    const data = JSON.stringify(summary, null, 2);
    await new Promise((resolve, reject) => setTimeout(resolve, 1000));
    send(data, to);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    await sendPiplImages(result, to);
};
function printEndatoResult(persons, send) {
    persons.forEach((v) => {
        const rows = [];
        rows.push(v.fullName + (v.age ? ' - ' + v.age : '') + (v.dob ? ' - ' + v.dob : ''));
        const dateOfDeath = v.datesOfDeath && v.datesOfDeath[0] && v.datesOfDeath[0].dod;
        if (dateOfDeath)
            rows.push('Deceased (' + dateOfDeath + ')');
        if (v.emailAddresses) {
            rows.push('E-mails');
            v.emailAddresses.forEach((email) => rows.push('  - ' + email.emailAddress));
        }
        if (v.phoneNumbers) {
            rows.push('Phone');
            v.phoneNumbers.forEach(({ phoneNumber, company, location, phoneType }) => {
                rows.push('  - ' + phoneNumber);
                rows.push('    - ' + phoneType);
                rows.push('    - ' + location);
                rows.push('    - ' + company);
            });
        }
        if (v.addresses) {
            rows.push('Addresses');
            v.addresses.forEach((address) => rows.push('  - ' + address.fullAddress));
        }
        if (v.relativesSummary.length) {
            rows.push('Relatives');
            v.relativesSummary.forEach(({ firstName, middleName, lastName }) => rows.push('  - ' + firstName + ' ' + middleName + ' ' + lastName));
        }
        if (v.associatesSummary.length) {
            rows.push('Associates');
            v.associatesSummary.forEach(({ firstName, middleName, lastName }) => rows.push('  - ' + [firstName, middleName, lastName].filter(Boolean).join(' ')));
        }
        send(rows.join('\n'));
    });
}
exports.printEndatoResult = printEndatoResult;
/*
const piplNumberLookup = async (number, to) => {
  const cached = await redis.get("pipl." + number);
  if (cached) {
    await printPiplResult(number, JSON.parse(cached), to);
  } else {
    const result = await pipl.search({ phone: number });
    await redis.set("pipl." + number, JSON.stringify(result));
    await redis.expire("pipl." + number, 60 * 60 * 24 * 3);
    await printPiplResult(number, result, to);
  }
};
*/
const twilioLookup = async (phoneNumber) => {
    const response = await twilio.lookups
        .phoneNumbers(phoneNumber)
        .fetch({ type: ["carrier", "caller-name"] });
    return {
        callerName: response.callerName,
        countryCode: response.countryCode,
        phoneNumber: response.phoneNumber,
        nationalFormat: response.nationalFormat,
        carrier: response.carrier
    };
};
const cursors = {};
const splitJid = (jid) => jid.match(/(?:[^@/]+)/g).filter(Boolean);
const deleteNullKeys = (o) => {
    if (typeof o !== "object")
        return o;
    if (Array.isArray(o))
        return o.slice().map((v) => deleteNullKeys(v));
    const result = { ...o };
    Object.keys(result).forEach((v) => {
        if (result[v] === null)
            delete result[v];
        if (typeof result[v] === "object")
            result[v] = deleteNullKeys(result[v]);
    });
    return result;
};
const redis = new ioredis_1.default(process.env.REDIS_URI || "redis://127.0.0.1:6379");
const timeout = (n) => new Promise((resolve) => setTimeout(resolve, n));
const POLL_INTERVAL = 500;
const toJid = ({ host, username }) => {
    return username + "@" + host;
};
const pullIncomingCalls = () => {
    (async () => {
        while (true) {
            try {
                const incomingRaw = await redis.lpop("calls-in");
                if (!incomingRaw) {
                    await timeout(POLL_INTERVAL);
                    continue;
                }
                else {
                    const incoming = JSON.parse(incomingRaw);
                    const jid = toJid({
                        host: process.env.DOMAIN,
                        username: incoming.did,
                    });
                    send("INCOMING:<" + incoming.from + "=>" + incoming.did + ">", jid);
                    await callerId(incoming.from, jid);
                }
            }
            catch (e) {
                logger_1.logger.error(e);
            }
            await timeout(POLL_INTERVAL);
        }
    })().catch((err) => logger_1.logger.error(err));
};
const callerId = async (number, to) => {
    const twilioResults = await twilioLookup(number);
    send(JSON.stringify(twilioResults, null, 2), to);
};
/*
const lookupTruePeopleSearchQuery = async (query) => {
  const truepeoplesearch = (await TruePuppeteer.initialize({
    noSandbox: true,
    logger: {
      info(v) {
        logger.info(v);
      },
    },
  })) as TruePuppeteer;
  let result = null;
  if (query.match(/^\d+$/)) {
    result = await truepeoplesearch.searchPhone({ phone: query } as any);
  } else {
    const processed = piplQueryToObject(query);
    if (processed.streetaddress) {
      result = await truepeoplesearch.searchAddress(processed);
    } else {
      result = await truepeoplesearch.searchName(processed);
    }
  }
  await truepeoplesearch._browser.close();
  return result;
};
*/
const lookupFaxVinQuery = async (query) => {
    const faxvin = (await faxvin_puppeteer_1.FaxvinPuppeteer.initialize({
        noSandbox: true,
        logger: {
            info(v) {
                logger_1.logger.info(v);
            },
        },
    }));
    const processed = (0, parsers_1.piplQueryToObject)(query);
    const result = await faxvin.searchPlate(query);
    await faxvin.close();
    return result;
};
const sendAsteriskCommand = async (command) => {
    logger_1.logger.info("creating connection");
    const connection = new asterisk_manager_1.default(process.env.AMI_PORT || "5038", process.env.AMI_HOST || "asterisk", process.env.AMI_USER || "admin", process.env.AMI_PASSWORD || "admin");
    await new Promise((resolve) => connection.on("rawevent", (evt) => {
        if (evt.message === "Authentication accepted")
            resolve(evt);
    }));
    logger_1.logger.info("connected to AMI");
    try {
        logger_1.logger.info("sending command: " + command);
        let result = await new Promise((resolve, reject) => connection.action({
            action: "command",
            command: command,
        }, (err, res) => (err ? reject(err) : resolve(res))));
        logger_1.logger.info("AMI response");
        logger_1.logger.info(result);
        logger_1.logger.info("closing connection");
        connection.disconnect();
        return result;
    }
    catch (e) {
        logger_1.logger.error(e);
        throw e;
    }
};
exports.sendAsteriskCommand = sendAsteriskCommand;
const writeSipAccounts = async (sipAccounts) => {
    await fs_extra_1.default.writeFileSync("/etc/asterisk/sip.conf", (0, parsers_1.buildConfiguration)(sipAccounts));
    await (0, exports.sendAsteriskCommand)("sip reload");
    await (0, exports.sendAsteriskCommand)("voicemail reload");
    return true;
};
const printDossier = async (body, to) => {
    to = to.split("/")[0];
    if (body.substr(0, "block-voip".length).toLowerCase() === "block-voip") {
        const ext = await redis.get("extfor.", to);
        if (!ext)
            return;
        await redis.del("voip-passthrough." + ext);
        talkGhastly(to);
        return;
    }
    if (body.substr(0, "unblock-voip".length).toLowerCase() === "unblock-voip") {
        const ext = await redis.get("extfor.", to);
        if (!ext)
            return;
        await redis.set("voip-passthrough." + ext, "1");
        talkGhastly(to);
        return;
    }
    if (body.substr(0, "ghostem".length).toLowerCase() === "ghostem") {
        await redis.set("ghostem." + to.split('@')[0], "1");
        talkGhastly(to);
        return;
    }
    if (body.substr(0, "unghostem".length).toLowerCase() === "unghostem") {
        await redis.del("ghostem." + to.split('@')[0]);
        talkGhastly(to);
        return;
    }
    if (body.substr(0, "registerpeer".length).toLowerCase() === "registerpeer") {
        const match = body.split(/\s+/g).slice(1).join(" ");
        if (!match) {
            send('must send "registerpeer tls://XXX:password@domain:port', to);
        }
        else {
            const sipAccounts = await (0, parsers_1.readSipAccounts)();
            const account = sipAccounts.find((v) => v.section === match);
            if (!account) {
                const parsed = url_1.default.parse(match);
                const auth = parsed.auth.split(":");
                if (parsed.hostname &&
                    parsed.protocol &&
                    parsed.port &&
                    parsed.auth &&
                    parsed.auth.split(":").length === 2) {
                    const generalSection = sipAccounts.find((v) => v.section === "general");
                    if (!generalSection) {
                        send("sip.conf malformed -- can't edit", to);
                        return;
                    }
                    generalSection.fields.push(["register", "> " + match]);
                    sipAccounts.push({
                        section: auth[0],
                        fields: [
                            ["type", "friend"],
                            ["canreinvite", "no"],
                            ["defaultuser", auth[0]],
                            ["secret", auth[1]],
                            ["context", auth[0]],
                            ["host", parsed.hostname],
                            ["port", parsed.port],
                            ["transport", parsed.protocol.split(":")[0]],
                            ["disallow", "all"],
                            ["allow", "ulaw"],
                            ["fromuser", auth[0]],
                            ["trustrpid", "yes"],
                            ["sendrpid", "yes"],
                            ["insecure", "invite"],
                            ["encryption", "yes"],
                        ],
                    });
                    await writeSipAccounts(sipAccounts);
                    send(auth[0] + "  registered", to);
                }
            }
        }
        talkGhastly(to);
        return;
    }
    if (body.substr(0, "createpeer".length).toLowerCase() === "createpeer") {
        const match = body.split(/\s+/g).slice(1).join(" ");
        if (!match || match.length !== 4) {
            send('must send "createpeer XXXX', to);
        }
        else {
            const sipAccounts = await (0, parsers_1.readSipAccounts)();
            const account = sipAccounts.find((v) => v.section === match);
            if (!account) {
                const secret = crypto_1.default.randomBytes(8).toString("hex");
                sipAccounts.push({
                    section: match,
                    modifier: 'friends_internal',
                    fields: [
                        ["defaultuser", match],
                        ["secret", secret],
                        ["context", match],
                        ["nat", "no"],
                    ],
                });
                await writeSipAccounts(sipAccounts);
                send("registerpeer tls://" +
                    match +
                    ":" +
                    secret +
                    "@" +
                    process.env.DOMAIN +
                    ":35061", to);
            }
        }
        talkGhastly(to);
        return;
    }
    if (body.substr(0, "register".length).toLowerCase() === "register") {
        const match = body.split(/\s+/g).slice(1).join(" ");
        if (!match || isNaN(match)) {
            send('must send "register NXX" i.e. "register 123"', to);
        }
        else {
            const sipAccounts = await (0, parsers_1.readSipAccounts)();
            const account = sipAccounts.find((v) => v.section === match);
            if (!account) {
                if (match.length < 4) {
                    const password = crypto_1.default.randomBytes(8).toString("hex");
                    sipAccounts.push({
                        section: match,
                        modifier: "friends_internal",
                        fields: [
                            ["secret", password],
                            ["defaultuser", match],
                            ["nat", "force_rport,comedia"],
                            ["context", "authenticated"],
                        ],
                    });
                    const voicemailAccounts = await (0, parsers_1.readVoicemail)();
                    voicemailAccounts.default = voicemailAccounts.default || [];
                    const pin = String(1000 + Math.floor(Math.random() * 9000));
                    voicemailAccounts.default.push({
                        type: "mapping",
                        key: match,
                        value: [pin, match, match + "@gmail.com"],
                    });
                    await writeSipAccounts(sipAccounts);
                    await (0, parsers_1.writeVoicemail)(voicemailAccounts);
                    await redis.set("extfor." + to.split("@")[0], match);
                    send("SIP password: " + password, to);
                    send("PIN: " + pin, to);
                }
                else {
                    const ext = await redis.get("extfor." + to.split("@")[0]);
                    if (!ext) {
                        send("must register a 3 digit extension first from this handle", to);
                    }
                    else {
                        const extAccount = sipAccounts.find((v) => v.section === ext);
                        sipAccounts.push({
                            section: match,
                            modifier: "friends_internal",
                            fields: [
                                ["secret", account.fields.find((v) => v[0] === "secret")[1]],
                                ["nat", "force_rport,comedia"],
                                ["context", "anonymous_device"],
                                ["defaultuser", match],
                            ],
                        });
                        await redis.hset("devicelist." + extAccount, match, "1");
                        await redis.set("extfordevice." + match, extAccount);
                        await writeSipAccounts(sipAccounts);
                        send("registered " + match + " to " + extAccount, to);
                    }
                }
            }
            else {
                send("already registered", to);
            }
        }
        talkGhastly(to);
        return;
    }
    if (body.substr(0, "socialscan".length).toLowerCase() === "socialscan") {
        const match = body.match(/^socialscan\s+(.*$)/);
        if (match) {
            const search = match[1];
            await subprocesses.socialscan(search, (v) => send(v, to));
            talkGhastly(to);
        }
        return;
    }
    if (body.substr(0, "whatsmyname".length).toLowerCase() === "whatsmyname") {
        const match = body.match(/^whatsmyname\s+(.*$)/i);
        if (match) {
            const search = match[1];
            send("web_accounts_list_checker.py -u " + search, to);
            send("wait for complete ...", to);
            await subprocesses.whatsmyname(search, (v) => send(v, to));
            talkGhastly(to);
        }
        return;
    }
    if (body.substr(0, "holehe".length).toLowerCase() === "holehe") {
        const match = body.match(/^holehe\s+(.*$)/i);
        if (match) {
            const search = match[1];
            send("holehe " + search, to);
            send("wait for complete ...", to);
            await subprocesses.holehe(search, (v) => send(v, to));
            talkGhastly(to);
        }
        return;
    }
    if (body.substr(0, "zgrep ".length).toLowerCase().trim() === "zgrep") {
        const match = body.match(/^zgrep\s+(.*$)/i);
        if (match) {
            const search = match[1];
            send('zgrep -a "' + search + '"', to);
            send("wait for complete... (this takes a while)", to);
            send(await runZgrep(search, to), to);
            send("zgrep:" + search + ": done!", to);
        }
        return;
    }
    if (body.substr(0, "linkedin".length).toLowerCase().trim() === "linkedin") {
        const match = body.match(/^linkedin\s+(.*$)/i);
        if (match) {
            const search = match[1].toLowerCase();
            send('grep -r "' + search + '"', to);
            send("wait for complete... (this takes a while)", to);
            send(await runLinkedIn(search, to), to);
            send("linkedin:" + search + ": done!", to);
        }
        return;
    }
    if (body.substr(0, "zgrep-full ".length).toLowerCase().trim() === "zgrep-full") {
        const match = body.match(/^zgrep-full\s+(.*$)/i);
        if (match) {
            const search = match[1];
            send('zgrep-full -a "' + search + '"', to);
            send("wait for complete... (this takes a while)", to);
            send(await runZgrepFull(search, to), to);
            send("zgrep-full:" + search + ": done!", to);
        }
        return;
    }
    if (body.substr(0, "endato".length).toLowerCase() ===
        "endato") {
        const match = body.match(/^endato\s+(.*$)/i);
        if (match) {
            const search = match[1];
            logger_1.logger.info(search);
            logger_1.logger.info((0, parsers_1.piplQueryToObject)(search));
            send('endato ' + search, to);
            printEndatoResult((await endato_1.EndatoClient.fromEnv().personSearch((0, parsers_1.piplQueryToObject)(search))).persons || [], (v) => send(v, to));
            talkGhastly(to);
        }
        return;
    }
    /*
    if (
      body.substr(0, "truepeoplesearch".length).toLowerCase() ===
      "truepeoplesearch"
    ) {
      const match = body.match(/^truepeoplesearch\s+(.*$)/i);
      if (match) {
        const search = match[1];
        send("truepeoplesearch-puppeteer " + search, to);
        send("wait for complete ...", to);
        send(
          JSON.stringify(await lookupTruePeopleSearchQuery(search), null, 2),
          to,
        );
        talkGhastly(to);
      }
      return;
    }
   */
    if (body.substr(0, "facebook".length).toLowerCase() === "facebook") {
        const match = body.match(/^facebook\s+(.*$)/i);
        if (match) {
            const search = match[1];
            send("facebook-recover-puppeteer " + search, to);
            send("wait for complete ...", to);
            send(JSON.stringify(await facebook_recover_puppeteer_1.default.lookupPhone({ phone: search }), null, 2), to);
            talkGhastly(to);
        }
        return;
    }
    if (body.substr(0, "donotcall".length).toLowerCase() === "donotcall") {
        const match = body.match(/^donotcall\s+(.*$)/i);
        if (match) {
            const search = match[1];
            send("ghostmaker donotcall " + search, to);
            send("wait for complete ...", to);
            await require("/root/ghostmaker").addToDoNotCall(search);
            talkGhastly(to);
        }
        return;
    }
    if (body.substr(0, "searchdids".length).toLowerCase() === "searchdids") {
        const match = body.match(/^searchdids\s+(.*$)/i);
        if (match) {
            const search = match[1];
            send("searchdids " + search, to);
            const dids = (await searchDIDs(search)).join(", ");
            send(dids, to);
        }
        return;
    }
    if (body.substr(0, "orderdid".length).toLowerCase() === "orderdid") {
        const match = body.match(/^orderdid\s+(.*$)/i);
        if (match) {
            const search = match[1];
            send("orderdid " + search, to);
            try {
                await orderDID(search, to.split("@")[0]);
                send("added!", to);
            }
            catch (e) {
                send(e.message, to);
            }
        }
        return;
    }
    if (body.substr(0, "faxvin".length).toLowerCase() === "faxvin") {
        const match = body.match(/^faxvin\s+(.*$)/i);
        if (match) {
            const search = match[1];
            send("faxvin-puppeteer " + search, to);
            send("wait for complete ...", to);
            send(JSON.stringify(await lookupFaxVinQuery(search), null, 2), to);
            talkGhastly(to);
        }
        return;
    }
    if (body.substr(0, "sherlock".length).toLowerCase() === "sherlock") {
        const match = body.match(/^sherlock\s+(.*$)/i);
        if (match) {
            const search = match[1];
            send("sherlock " + search + " --print-found", to);
            send("wait for complete ...", to);
            await subprocesses.sherlock(search, (data) => send(data, to));
            talkGhastly(to);
        }
        return;
    }
    /*
    if (body.substr(0, 4).toLowerCase() === "pipl") {
      const match = body.match(/^(?:p|P)ipl\s+(.*$)/);
      if (match) {
        const search = match[1];
        if (search.indexOf(":") !== -1) {
          const fromPipl = await pipl.search(piplQueryToObject(search));
          await printPiplResult(search, fromPipl, to);
          return;
        } else if (search.indexOf("@") !== -1) {
          const data = await pipl.search({ email: search });
          logger.info(data);
          await printPiplResult(search, data, to);
          return;
        } else if (search.match(/\d+/)) {
          const data = await pipl.search({ phone: search });
          await printPiplResult(search, data, to);
          return;
        } else {
          const split = search.split(/\s+/);
          const data = await pipl.search({
            first_name: split[0],
            last_name: split[1],
            state: split[2],
          });
          await printPiplResult(search, data, to);
          return;
        }
      }
     */
    if (/(?:^\d{10,11}$)/.test(body)) {
        if (body.length === 11)
            body = body.substr(1);
        body = "+1" + body;
        const twilioResults = await twilioLookup(body);
        const endatoResults = (await endato_1.EndatoClient.fromEnv().personSearch({ phone: body })).persons || [];
        send(JSON.stringify({ ...twilioResults }, null, 2), to);
        printEndatoResult(endatoResults, (v) => send(v, to));
        send("good luck ghost", to);
        return;
    }
    if (body.substr(0, "context:".length) === "context:") {
        await redis.set("context." + to, body.substr("context:".length));
        send("set", to);
        return;
    }
    if (body.substr(0, "temperature:".length) === "temperature:") {
        await redis.set("temperature." + to, body.substr("context:".length));
        send("set", to);
        return;
    }
    if (body.substr(0, "answer:".length) === "answer:") {
        await answerQuestion(body.substr("answer:".length), to);
        return;
    }
};
async function run() {
    xmpp = (0, client_1.client)({
        service: process.env.XMPP_SERVICE || process.env.DOMAIN,
        domain: process.env.DOMAIN,
        resource: "dossi",
        username: "dossi",
        password: process.env.ROOT_PASSWORD || "password",
    });
    (0, debug_1.default)(xmpp, true);
    xmpp.on("online", () => {
        logger_1.logger.info("online!");
        xmpp.send((0, client_1.xml)("presence"));
    });
    xmpp.on("stanza", async (stanza) => {
        if (!stanza.is("message"))
            return;
        if (!stanza.getChild("body"))
            return;
        const to = stanza.attrs.from;
        let body = stanza.getChild("body").children[0].trim();
        console.log("to: " + to);
        console.log(require("util").inspect(stanza));
        await printDossier(body, to);
    });
    await xmpp.start();
    pullIncomingCalls();
}
exports.run = run;
//# sourceMappingURL=dossi.js.map