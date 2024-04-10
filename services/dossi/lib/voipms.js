"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.VoipMs = void 0;
const querystring_1 = __importDefault(require("querystring"));
const request = require("request");
const requestDebug = require("request-debug");
if (process.env.NODE_ENV === "development")
    requestDebug(request);
const fns = [
    "getBalance",
    "getConference",
    "getConferenceMembers",
    "getConferenceRecordings",
    "getConferenceRecordingFile",
    "getSequences",
    "getCountries",
    "getIP",
    "getLanguages",
    "getLocales",
    "getServersInfo",
    "getTransactionHistory",
    "Accounts",
    "createSubAccount",
    "delSubAccount",
    "getAllowedCodecs",
    "getAuthTypes",
    "getDeviceTypes",
    "getDTMFModes",
    "getInvoice",
    "getLockInternational",
    "getMusicOnHold",
    "getNAT",
    "getProtocols",
    "getRegistrationStatus",
    "getReportEstimatedHoldTime",
    "getRoutes",
    "getSubAccounts",
    "addMemberToConference",
    "setSubAccount",
    "Call",
    "getCallAccounts",
    "getCallBilling",
    "getCallTypes",
    "getCDR",
    "getRates",
    "getTerminationRates",
    "getResellerCDR",
    "Call",
    "getCallParking",
    "setCallParking",
    "delCallParking",
    "Call",
    "getCallRecordings",
    "getCallRecording",
    "sendCallRecordingEmail",
    "delCallRecording",
    "Clients",
    "addCharge",
    "addPayment",
    "getBalanceManagement",
    "getCharges",
    "getClientPackages",
    "getClients",
    "getClientThreshold",
    "getDeposits",
    "getPackages",
    "getResellerBalance",
    "setClient",
    "setClientThreshold",
    "setConference",
    "setConferenceMember",
    "setSequences",
    "signupClient",
    "DIDs",
    "backOrderDIDUSA",
    "backOrderDIDCAN",
    "cancelDID",
    "connectDID",
    "delCallback",
    "delCallerIDFiltering",
    "delCallHunting",
    "delConference",
    "delConferenceMember",
    "delSequences",
    "delClient",
    "delDISA",
    "deleteSMS",
    "deleteMMS",
    "delForwarding",
    "delIVR",
    "delPhonebook",
    "delQueue",
    "delRecording",
    "delRingGroup",
    "delSIPURI",
    "delStaticMember",
    "delTimeCondition",
    "getCallbacks",
    "getCallerIDFiltering",
    "getCallHuntings",
    "getCarriers",
    "getDIDCountries",
    "getDIDsCAN",
    "getDIDsInfo",
    "getDIDsInternationalGeographic",
    "getDIDsInternationalNational",
    "getDIDsInternationalTollFree",
    "getDIDsUSA",
    "getDISAs",
    "getForwardings",
    "getInternationalTypes",
    "getIVRs",
    "getJoinWhenEmptyTypes",
    "getMMS",
    "getMediaMMS",
    "getPhonebook",
    "getPortability",
    "getProvinces",
    "getQueues",
    "getRateCentersCAN",
    "getRateCentersUSA",
    "getRecordings",
    "getRecordingFile",
    "getRingGroups",
    "getRingStrategies",
    "getSIPURIs",
    "getSMS",
    "getStates",
    "getStaticMembers",
    "getTimeConditions",
    "getVoicemailSetups",
    "getVoicemailAttachmentFormats",
    "orderDID",
    "orderDIDInternationalGeographic",
    "orderDIDInternationalNational",
    "orderDIDInternationalTollFree",
    "orderDIDVirtual",
    "orderTollFree",
    "orderVanity",
    "searchDIDsCAN",
    "searchDIDsUSA",
    "searchTollFreeCanUS",
    "searchTollFreeUSA",
    "searchVanity",
    "sendSMS",
    "sendMMS",
    "setCallback",
    "setCallerIDFiltering",
    "setCallHunting",
    "setDIDBillingType",
    "setDIDInfo",
    "setDIDPOP",
    "setDIDRouting",
    "setDIDVoicemail",
    "setDISA",
    "setForwarding",
    "setIVR",
    "setPhonebook",
    "setQueue",
    "setRecording",
    "setRingGroup",
    "setSIPURI",
    "setSMS",
    "setStaticMember",
    "setTimeCondition",
    "unconnectDID",
    "Fax",
    "cancelFaxNumber",
    "deleteFaxMessage",
    "delEmailToFax",
    "delFaxFolder",
    "getBackOrders",
    "getFaxProvinces",
    "getFaxStates",
    "getFaxRateCentersCAN",
    "getFaxRateCentersUSA",
    "getFaxNumbersInfo",
    "getFaxNumbersPortability",
    "getFaxMessages",
    "getFaxMessagePDF",
    "getFaxFolders",
    "getEmailToFax",
    "mailFaxMessagePDF",
    "moveFaxMessage",
    "orderFaxNumber",
    "setFaxFolder",
    "setEmailToFax",
    "searchFaxAreaCodeCAN",
    "searchFaxAreaCodeUSA",
    "setFaxNumberInfo",
    "setFaxNumberEmail",
    "setFaxNumberURLCallback",
    "sendFaxMessage",
    "e911",
    "e911AddressTypes",
    "e911Cancel",
    "e911Info",
    "e911Provision",
    "e911ProvisionManually",
    "e911Update",
    "e911Validate",
    "Local",
    "addLNPPort",
    "addLNPFile",
    "getLNPStatus",
    "getLNPNotes",
    "getLNPListStatus",
    "getLNPList",
    "getLNPDetails",
    "getLNPAttachList",
    "getLNPAttach",
    "Voicemail",
    "createVoicemail",
    "delMessages",
    "delMemberFromConference",
    "delVoicemail",
    "getPlayInstructions",
    "getTimezones",
    "getVoicemails",
    "getVoicemailFolders",
    "getVoicemailMessageFile",
    "getVoicemailMessages",
    "markListenedVoicemailMessage",
    "markUrgentVoicemailMessage",
    "moveFolderVoicemailMessage",
    "sendVoicemailEmail",
    "setVoicemail"
];
class VoipMs {
    static fromEnv() {
        return new this({ username: process.env.VOIPMS_USERNAME, password: process.env.VOIPMS_PASSWORD });
    }
    constructor({ username, password }) {
        this.config = {
            username,
            password,
        };
        Object.assign(this, fns.reduce((r, v) => {
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
                url: `https://voip.ms/api/v1/rest.php?api_username=${this.config.username}&api_password=${this.config.password}&${querystring_1.default.stringify({
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
exports.VoipMs = VoipMs;
//# sourceMappingURL=voipms.js.map