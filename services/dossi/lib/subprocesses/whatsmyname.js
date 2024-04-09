"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const utils_1 = require("./utils");
const path_1 = __importDefault(require("path"));
const child_process_1 = __importDefault(require("child_process"));
async function default_1(username, send) {
    const dir = process.cwd();
    await (0, utils_1.waitForExit)(child_process_1.default.spawn("python3", [path_1.default.join(process.env.HOME, "WhatsMyName-Client", "wmnc.py"), "update"], { stdio: "pipe" }));
    return await (0, utils_1.pipeToSend)(child_process_1.default.spawn("python3", [
        path_1.default.join(process.env.HOME, "WhatsMyName-Client", "wmnc.py"),
        "find",
        username,
    ], { stdio: "pipe" }), send);
}
exports.default = default_1;
//# sourceMappingURL=whatsmyname.js.map