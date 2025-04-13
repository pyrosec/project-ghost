import ari from "ari-client";
import { consume } from "./pipeline";
import os from "os";
import path from "path";
import { logger } from "./logger";
import { AriTranscriber } from "./ari-transcriber";

export async function run() {
  console.log("Starting RTT service with enhanced configuration");
  
  // Get the dialstring from environment or use a default
  const dialstring = process.env.RTT_DIALSTRING || 'Local/s@stasis';
  console.log(`Using dialstring: ${dialstring}`);
  
  return await new AriTranscriber({
    ariServerUrl: process.env.ARI_URI || 'http://asterisk:8088/ari',
    speakerDiarization: false,
    format: 'ulaw',
    listenServer: '0.0.0.0:9999',
    speechModel: 'default',
    speechLang: 'en-US',
    ariUser: process.env.ARI_USERNAME || 'admin',
    ariPassword: process.env.ARI_PASSWORD || 'admin',
    audioOutput: path.join(os.tmpdir(), 'audio.wav'),
    // Use a simple Local channel that connects directly to Stasis
    // This avoids the need for a specific SIP endpoint
    dialstring: dialstring,
    wssPort: '9998'
  });
}
