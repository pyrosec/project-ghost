"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.VoipmsClient = void 0;
const request = require("request");
const fns_json_1 = __importDefault(require("./fns.json"));
const query_string_1 = __importDefault(require("query-string"));
if (process.env.NODE_ENV === "development")
    require("request-debug")(request);
class VoipmsClient {
    static fromEnv() {
        return new this({ username: process.env.VOIPMS_USERNAME, password: process.env.VOIPMS_PASSWORD });
    }
    constructor({ username, password }) {
        this.config = {
            username,
            password,
        };
        Object.assign(this, fns_json_1.default.reduce((r, v) => {
            r[v] = {
                get: async (o) => {
                    return await this._requestGet({
                        ...o,
                        method: v,
                    });
                },
                post: async (o) => {
                    return await this._requestPost({
                        ...o,
                        method: v,
                    });
                },
            };
            return r;
        }, {}));
    }
    async _requestGet(o) {
        return new Promise((resolve, reject) => {
            request({
                method: "GET",
                url: `https://voip.ms/api/v1/rest.php?api_username=${this.config.username}&api_password=${this.config.password}&${query_string_1.default.stringify({
                    ...o,
                    content_type: "json",
                })}`,
                headers: this.makeHeaders()
            }, (err, response) => {
                if (err)
                    return reject(err);
                try {
                    try {
                        const result = JSON.parse(response.body);
                        resolve(result);
                    }
                    catch (e) {
                        if (process.env.NODE_ENV === "development")
                            console.error(response.body);
                        throw Error("failed to parse JSON from voip.ms");
                    }
                }
                catch (e) {
                    reject(e);
                }
            });
        });
    }
    makeHeaders() {
        return {
            Host: "voip.ms",
            Referer: 'https://voip.ms/m/api.php',
            Origin: 'voip.ms',
            'User-Agent': 'curl/7.68.0'
        };
    }
    async _requestPost(o) {
        return new Promise((resolve, reject) => {
            request({
                method: "POST",
                url: "https://voip.ms/api/v1/rest.php",
                headers: this.makeHeaders(),
                json: {
                    api_username: this.config.username,
                    api_password: this.config.password,
                    ...o,
                    content_type: "json",
                },
            }, (err, response) => {
                try {
                    return err ? reject(err) : resolve(JSON.parse(response.body));
                }
                catch (e) {
                    reject(e);
                }
            });
        });
    }
}
exports.VoipmsClient = VoipmsClient;
Object.assign(VoipmsClient.prototype, fns_json_1.default.reduce((r, v) => { }, {}));
module.exports = VoipmsClient;
//# sourceMappingURL=voipms.js.map