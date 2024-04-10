import { GoogleSpeechProvider } from "./google-speech-provider";
export declare class AriTranscriber {
    audioServer: any;
    opts: any;
    ariController: any;
    speechProvider: GoogleSpeechProvider;
    wssServer: any;
    webServer: any;
    constructor(opts: any);
    startWebsocketServer(): void;
    transcriptCallback(text: any, isFinal: any): void;
    resultsCallback(results: any): void;
    transcriber(): Promise<void>;
}
