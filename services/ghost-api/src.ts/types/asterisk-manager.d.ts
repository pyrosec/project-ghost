declare module 'asterisk-manager' {
  import { EventEmitter } from 'events';

  class AsteriskManager extends EventEmitter {
    constructor(
      port: number,
      host: string,
      username: string,
      password: string,
      events?: boolean
    );

    keepConnected(): void;
    disconnect(): void;

    action(
      action: Record<string, string>,
      callback?: (err: Error | null, response: Record<string, any>) => void
    ): void;
  }

  export = AsteriskManager;
}
