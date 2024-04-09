import client from "ari-client";

export async function run() {
  const ari = await client.connect(process.env.ARI_HOST || 'asterisk', process.env.ARI_USERNAME || 'admin', process.env.ARI_PASSWORD || 'admin');
  
  
}
