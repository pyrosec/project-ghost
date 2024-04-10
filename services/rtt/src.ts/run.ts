import ari from "ari-client";
import { consume } from "./pipeline";

export async function run() {
  const client = await ari.connect(process.env.ARI_URI || 'asterisk', process.env.ARI_USERNAME || 'admin', process.env.ARI_PASSWORD || 'admin');
  await consume(client);
}
