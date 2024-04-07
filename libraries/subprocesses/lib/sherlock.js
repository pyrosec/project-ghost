"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const path_1 = __importDefault(require("path"));
const child_process_1 = __importDefault(require("child_process"));
const utils_1 = require("./utils");
async function default_1(username, send) {
    return await (0, utils_1.pipeToSend)(child_process_1.default.spawn("python3", [
        path_1.default.join(process.env.HOME, "sherlock", "sherlock", "sherlock.py"),
        "--print-found",
        username,
    ], { stdio: "pipe" }), send);
}
exports.default = default_1;
//# sourceMappingURL=sherlock.js.map