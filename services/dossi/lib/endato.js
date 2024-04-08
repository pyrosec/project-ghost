"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EndatoClient = void 0;
class EndatoClient {
    constructor({ apiKey, apiSecret, searchType, clientType }) {
        this.apiKey = apiKey;
        this.apiSecret = apiSecret;
        this.searchType = searchType || 'APIContactEnrich';
        this.clientType = clientType || 'node-fetch';
    }
    static fromEnv() {
        return new this({
            apiKey: process.env.ENDATO_API_KEY,
            apiSecret: process.env.ENDATO_API_SECRET,
            searchType: 'DevAPIContactEnrich',
            clientType: process.env.ENDATO_CLIENT_TYPE || 'node-fetch'
        });
    }
    async _call(endpoint, searchType, payload) {
        const responseText = await (await fetch(endpoint, {
            method: 'POST',
            body: JSON.stringify(payload),
            headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json',
                'galaxy-ap-name': this.apiKey,
                'galaxy-ap-password': this.apiSecret,
                'galaxy-client-type': this.clientType,
                'galaxy-search-type': searchType
            }
        })).text();
        console.log(responseText);
        return JSON.parse(responseText);
    }
    async personSearch({ name, address, phone, email, citystatezip, dob }) {
        const nameSplit = (name || '').split(/\s/g);
        const first = nameSplit[0] || undefined;
        const last = nameSplit[nameSplit.length - 1] || undefined;
        const middle = nameSplit.length > 2 ? nameSplit[1] : undefined;
        return await this._call('https://devapi.endato.com/PersonSearch', 'Person', {
            FirstName: first,
            MiddleName: middle,
            LastName: last,
            Phone: phone,
            Email: email,
            Addresses: (address || citystatezip) && [{
                    AddressLine1: address,
                    AddressLine2: citystatezip
                }],
            dob
        });
    }
}
exports.EndatoClient = EndatoClient;
//# sourceMappingURL=endato.js.map