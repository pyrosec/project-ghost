"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.pipeToSend = exports.waitForExit = exports.mkTmp = exports.readResultRaw = exports.readResult = exports.tmpdir = exports.ansiRegex = void 0;
const mkdirp_1 = __importDefault(require("mkdirp"));
const tmpdir_1 = __importDefault(require("tmpdir"));
exports.tmpdir = tmpdir_1.default;
const path_1 = __importDefault(require("path"));
const fs_extra_1 = __importDefault(require("fs-extra"));
function ansiRegex({ onlyFirst = false } = {}) {
    const pattern = [
        "[\\u001B\\u009B][[\\]()#;?]*(?:(?:(?:(?:;[-a-zA-Z\\d\\/#&.:=?%@~_]+)*|[a-zA-Z\\d]+(?:;[-a-zA-Z\\d\\/#&.:=?%@~_]*)*)?\\u0007)",
        "(?:(?:\\d{1,4}(?:;\\d{0,4})*)?[\\dA-PR-TZcf-ntqry=><~]))",
    ].join("|");
    return new RegExp(pattern, onlyFirst ? undefined : "g");
}
exports.ansiRegex = ansiRegex;
const regex = ansiRegex();
const readResult = async (query) => {
    const result = JSON.parse((await fs_extra_1.default.readFile(path_1.default.join(tmpdir_1.default, query + ".json"), "utf8")).trim());
    return result;
};
exports.readResult = readResult;
const readResultRaw = async (query) => {
    const result = (await fs_extra_1.default.readFile(path_1.default.join(tmpdir_1.default, query + ".json"), "utf8")).trim();
    return result;
};
exports.readResultRaw = readResultRaw;
const mkTmp = async () => {
    await (0, mkdirp_1.default)(tmpdir_1.default);
};
exports.mkTmp = mkTmp;
const waitForExit = async (proc) => {
    return await new Promise((resolve, reject) => {
        proc.on("error", (err) => reject(err));
        proc.on("exit", (code) => resolve(code));
    });
};
exports.waitForExit = waitForExit;
async function pipeToSend(proc, send) {
    var data = "";
    return await new Promise((resolve, reject) => {
        proc.stdout.setEncoding("utf8");
        proc.stderr.setEncoding("utf8");
        proc.stdout.on("data", (_data) => {
            const stripped = stripAnsi(_data);
            data += stripped;
            send(stripped);
        });
        proc.stderr.on("data", (_data) => {
            const stripped = stripAnsi(_data);
            send(stripped);
        });
        proc.on("exit", (code) => resolve(data));
        proc.on("error", (err) => reject(err));
    });
}
exports.pipeToSend = pipeToSend;
function stripAnsi(string) {
    if (typeof string !== "string") {
        throw new TypeError(`Expected a \`string\`, got \`${typeof string}\``);
    }
    return string.replace(regex, "");
}
exports.default = stripAnsi;
//# sourceMappingURL=utils.js.map