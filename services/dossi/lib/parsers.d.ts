export declare const parseConfiguration: (s: any) => any;
export declare const parseVoicemail: (s: any) => any;
export declare const buildVoicemail: (voicemailAccounts: any) => string;
export declare const buildConfiguration: (o: any) => any;
export declare const readVoicemail: () => Promise<any>;
export declare const writeVoicemail: (voicemailAccounts: any) => Promise<void>;
export declare const readSipAccounts: () => Promise<any>;
export declare const piplQueryToObject: (query: string) => any;
