import tmpdir from "tmpdir";
export declare function ansiRegex({ onlyFirst }?: {
    onlyFirst?: boolean;
}): RegExp;
export { tmpdir };
export declare const readResult: (query: any) => Promise<any>;
export declare const readResultRaw: (query: any) => Promise<any>;
export declare const mkTmp: () => Promise<void>;
export declare const waitForExit: (proc: any) => Promise<unknown>;
export declare function pipeToSend(proc: any, send: any): Promise<string>;
export default function stripAnsi(string: any): string;
