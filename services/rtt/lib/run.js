"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.run = void 0;
const os_1 = __importDefault(require("os"));
const path_1 = __importDefault(require("path"));
const ari_transcriber_1 = require("./ari-transcriber");
async function run() {
    console.log("Starting RTT service with enhanced configuration");
    // Get the dialstring from environment or use a default
    const dialstring = process.env.RTT_DIALSTRING || 'Local/s@stasis';
    console.log(`Using dialstring: ${dialstring}`);
    return await new ari_transcriber_1.AriTranscriber({
        ariServerUrl: process.env.ARI_URI || 'http://asterisk:8088/ari',
        speakerDiarization: false,
        format: 'ulaw',
        listenServer: '0.0.0.0:9999',
        speechModel: 'default',
        speechLang: 'en-US',
        ariUser: process.env.ARI_USERNAME || 'admin',
        ariPassword: process.env.ARI_PASSWORD || 'admin',
        audioOutput: path_1.default.join(os_1.default.tmpdir(), 'audio.wav'),
        // Use a simple Local channel that connects directly to Stasis
        // This avoids the need for a specific SIP endpoint
        dialstring: dialstring,
        wssPort: '9998'
    });
}
exports.run = run;
//# sourceMappingURL=run.js.map