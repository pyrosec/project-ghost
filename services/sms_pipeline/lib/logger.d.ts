import { createLogger as createWinstonLogger } from "winston";
export interface GhostLogger extends ReturnType<typeof createWinstonLogger> {
    star(v: any): GhostLogger;
}
export declare const createLogger: (proc?: string) => GhostLogger;
export declare const logger: GhostLogger;
