import { Redis } from "ioredis";
import { logger } from "./logger";
const redis = new Redis(process.env.REDIS_URI || "redis://127.0.0.1:6379");

const DIAL_OUT_CHANNEL = "dial-out";

export async function flushOne(client, item) {
  const channel = await client
    .Channel()
    .originate({
      endpoint: "SIP/" + item.origin,
      application: "Dial",
      appArgs: "SIP/" + process.env.VOIPMS_SIP_USERNAME + "/1" + item.target,
    });
  logger.info(channel);
  await client.channels.setChannelVar({
    channelId: channel.id,
    variable: "CALLERID(num)",
    value: await redis.get("extfor." + item.origin),
  });
}

export async function consume(client) {
  const pop = async () => {
    const item = await redis.lpop(DIAL_OUT_CHANNEL);
    try {
      if (item) {
        logger.info(item);
        await flushOne(client, JSON.parse(item));
        await pop();
      }
    } catch (e) {
      logger.error(e);
    }
  };
  while (true) {
    await pop();
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}
