import ari from "ari-client";
import { consume } from "./pipeline";
import os from "os";
import path from "path";
import { logger } from "./logger";
import { AriTranscriber } from "./ari-transcriber";

export async function run() {
  console.log("Starting RTT service with enhanced configuration");
  
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
    // Use a direct SIP channel instead of Local channel
    // This might help with RTT functionality
    dialstring: 'SIP/rtt-test',
    wssPort: '9998'
  });
}
