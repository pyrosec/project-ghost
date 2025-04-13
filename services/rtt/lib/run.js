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
        // Use a direct SIP channel instead of Local channel
        // This might help with RTT functionality
        dialstring: 'SIP/rtt-test',
        wssPort: '9998'
    });
}
exports.run = run;
//# sourceMappingURL=run.js.map