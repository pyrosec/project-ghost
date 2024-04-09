export declare class VoipMs {
    config: any;
    [key: string]: any;
    static fromEnv(): VoipMs;
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
