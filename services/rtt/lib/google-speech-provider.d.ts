/// <reference types="node" />
import { Transform } from "stream";
import { SpeechClient } from "@google-cloud/speech";
export declare class GoogleSpeechProvider {
    speechClient: SpeechClient;
    request: any;
    recognizeStream: any;
    restartCounter: number;
    audioInput: any[];
    lastAudioInput: any[];
    resultEndTime: number;
    isFinalEndTime: number;
    finalRequestEndTime: number;
    newStream: boolean;
    bridgingOffset: number;
    lastTranscriptWasFinal: boolean;
    streamingLimit: number;
    audioInputStreamTransform: Transform;
    cb: any;
    resultsCallback: any;
    transcriptCallback: any;
    socket: any;
    constructor(config: any, socket: any, transcriptCallback: any, resultsCallback: any);
    startStream(): void;
    speechCallback(stream: any): any;
    transformer(chunk: any, encoding: any, callback: any): void;
    restartStream(): void;
}
