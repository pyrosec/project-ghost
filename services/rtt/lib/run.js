"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.run = void 0;
const ari_client_1 = __importDefault(require("ari-client"));
const pipeline_1 = require("./pipeline");
async function run() {
    const client = await ari_client_1.default.connect(process.env.ARI_URI || 'asterisk', process.env.ARI_USERNAME || 'admin', process.env.ARI_PASSWORD || 'admin');
    await (0, pipeline_1.consume)(client);
}
exports.run = run;
//# sourceMappingURL=run.js.map