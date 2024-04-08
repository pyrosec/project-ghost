"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const utils_1 = require("./utils");
const child_process_1 = __importDefault(require("child_process"));
const path_1 = __importDefault(require("path"));
async function default_1(username, send) {
    await (0, utils_1.mkTmp)();
    return await (0, utils_1.pipeToSend)(child_process_1.default.spawn("socialscan", ["--json", path_1.default.join(utils_1.tmpdir, username + ".json"), username], { stdio: "pipe" }), send);
}
exports.default = default_1;
//# sourceMappingURL=socialscan.js.map