"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.stripUsed = void 0;
const utils_1 = require("./utils");
const child_process_1 = __importDefault(require("child_process"));
const stripUsed = (s) => {
    return s
        .split("\n")
        .filter((v) => v.match("[+]"))
        .join("\n");
};
exports.stripUsed = stripUsed;
async function default_1(username, send) {
    return await (0, utils_1.pipeToSend)(child_process_1.default.spawn("holehe", [username, "--only-used", "--no-color"], {
        stdio: "pipe",
    }), (v) => send((0, exports.stripUsed)(v)));
}
exports.default = default_1;
//# sourceMappingURL=holehe.js.map