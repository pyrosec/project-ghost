import ari from "ari-client";
import { consume } from "./pipeline";
import { logger } from "./logger";

export async function run() {
  const client = await ari.connect(
    process.env.ARI_URI || "http://asterisk:8088/ari",
    process.env.ARI_USERNAME || "admin",
    process.env.ARI_PASSWORD || "admin",
  );
  logger.info(client);
  await consume(client);
}
