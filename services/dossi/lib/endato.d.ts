export declare class EndatoClient {
    apiKey: string;
    apiSecret: string;
    clientType: string;
    searchType: string;
    constructor({ apiKey, apiSecret, searchType, clientType }: any);
    static fromEnv(): EndatoClient;
    _call(endpoint: string, searchType: string, payload: any): Promise<any>;
    personSearch({ name, address, phone, email, citystatezip, dob }: any): Promise<any>;
}
