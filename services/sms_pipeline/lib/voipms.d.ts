export declare class VoipmsClient {
    config: any;
    static fromEnv(): VoipmsClient;
    constructor({ username, password }: {
        username: any;
        password: any;
    });
    _requestGet(o: any): Promise<unknown>;
    makeHeaders(): {
        Host: string;
        Referer: string;
        Origin: string;
        'User-Agent': string;
    };
    _requestPost(o: any): Promise<unknown>;
}
