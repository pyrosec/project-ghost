/// <reference types="node" />
/**
 * The ari controller handles the control interaction with Asterisk.
 * For simplicity's sake, this example just dials an extension rather
 * that trying to create conference bridges, etc.  For that reason,
 * we need to create a local channel and a simple mixing bridge as
 * well as the external media channel.
 */
import EventEmitter from "events";
export declare class AriController extends EventEmitter {
    options: any;
    closing: boolean;
    localChannel: any;
    externalChannel: any;
    bridge: any;
    ari: any;
    constructor(options: any);
    sendText(text: string): void;
    close(): Promise<void>;
    connect(): Promise<void>;
}
