"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.readSipAccounts = exports.writeVoicemail = exports.readVoicemail = exports.buildConfiguration = exports.buildVoicemail = exports.parseVoicemail = exports.parseConfiguration = void 0;
const fs_extra_1 = __importDefault(require("fs-extra"));
const parseConfiguration = (s) => {
    return s.match(/\[[^\[]+/gm).map((v) => ({
        section: ((s) => s.substr(1, s.length - 2))(v.match(/\[(?:[^\]]+)\]/g)[0]),
        modifier: ((s) => s && s[0].substr(1))(v.match(/\((?:[^\)]+)/g)),
        fields: v
            .split("\n")
            .slice(1)
            .reduce((r, v) => {
            const split = v.split("=");
            if (split[0][0] && split[0][0] !== ";") {
                r.push([split[0], split[1]]);
            }
            return r;
        }, []),
    }));
};
exports.parseConfiguration = parseConfiguration;
const parseVoicemail = (s) => {
    const fields = s
        .split("\n")
        .filter(Boolean)
        .filter((v) => v[0] !== ";");
    const result = {};
    let tag = "";
    fields.forEach((v) => {
        if (v[0] === "[") {
            tag = v.substr(1, v.length - 2);
            result[tag] = [];
        }
        else {
            if (v.match("=>")) {
                result[tag].push({
                    type: "mapping",
                    key: v.split("=>")[0].trim(),
                    value: v.split("=>")[1].trim().split(",").filter(Boolean),
                });
            }
            else {
                result[tag].push({
                    type: "field",
                    key: v.split("=")[0].trim(),
                    value: v.split("=")[1].trim(),
                });
            }
        }
    });
    return result;
};
exports.parseVoicemail = parseVoicemail;
const buildVoicemail = (voicemailAccounts) => {
    return Object.entries(voicemailAccounts)
        .map(([section, rows]) => {
        return [
            "[" + section + "]",
            ...rows.map((v) => v.type === "field"
                ? v.key + " = " + v.value
                : v.key + " => " + v.value.join(",")),
        ].join("\n");
    })
        .join("\n\n");
};
exports.buildVoicemail = buildVoicemail;
const buildConfiguration = (o) => {
    return o
        .map((v) => [
        "[" + v.section + "]" + (v.modifier ? "(" + v.modifier + ")" : ""),
        ...v.fields.map(([k, v]) => String(k) + "=" + String(v)),
    ].join("\n"))
        .join("\n\n");
};
exports.buildConfiguration = buildConfiguration;
const readVoicemail = async () => {
    return (0, exports.parseVoicemail)(await fs_extra_1.default.readFile("/etc/asterisk/voicemail.conf", "utf8"));
};
exports.readVoicemail = readVoicemail;
const writeVoicemail = async (voicemailAccounts) => {
    await fs_extra_1.default.writeFile("/etc/asterisk/voicemail.conf", (0, exports.buildVoicemail)(voicemailAccounts));
};
exports.writeVoicemail = writeVoicemail;
const readSipAccounts = async () => {
    return (0, exports.parseConfiguration)(await fs_extra_1.default.readFile("/etc/asterisk/sip.conf", "utf8"));
};
exports.readSipAccounts = readSipAccounts;
//# sourceMappingURL=parsers.js.map