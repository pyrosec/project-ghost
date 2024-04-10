"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.consume = exports.flushOne = void 0;
const ioredis_1 = require("ioredis");
const logger_1 = require("./logger");
const redis = new ioredis_1.Redis(process.env.REDIS_URI || "redis://127.0.0.1:6379");
const DIAL_OUT_CHANNEL = 'dial-out';
async function flushOne(client, item) {
    const channel = await (client.Channel()).originate({ endpoint: 'SIP/' + item.origin, application: 'Dial', appArgs: 'SIP/' + process.env.VOIPMS_SIP_USERNAME + '/1' + item.target });
    await client.channels.setChannelVar({
        channelId: channel.id,
        variable: 'CALLERID(num)',
        value: await redis.get('extfor.' + item.origin)
    });
}
exports.flushOne = flushOne;
async function consume(client) {
    const pop = async () => {
        const item = await redis.lpop(DIAL_OUT_CHANNEL);
        try {
            if (item) {
                await flushOne(client, JSON.parse(item));
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
}
exports.consume = consume;
//# sourceMappingURL=pipeline.js.map