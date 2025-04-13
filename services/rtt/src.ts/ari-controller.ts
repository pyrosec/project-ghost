/*
 *   Copyright 2019 Sangoma Technologies Corporation
 *   George Joseph <gjoseph@digium.com>
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */

/**
 * The ari controller handles the control interaction with Asterisk.
 * For simplicity's sake, this example just dials an extension rather
 * that trying to create conference bridges, etc.  For that reason,
 * we need to create a local channel and a simple mixing bridge as
 * well as the external media channel.
 */

import EventEmitter from "events";
import client = require("ari-client");
import util from "util";
import { logger } from "./logger";

const ln = (v) => ((console.log(require('util').inspect(v, { colors: true, depth: 15 }))), v);
export class AriController extends EventEmitter {
  public options: any;
  public closing: boolean;
  public localChannel: any;
  public externalChannel: any;
  public bridge: any;
  public ari: any;
  constructor(options: any) {
    super();
    this.options = Object.assign({}, options);
  }

  // Method to send text back to the caller
  sendText(text: string): void {
    console.log(`Sending text to caller: ${text}`);
    // This is a placeholder for actual implementation
    // In a real implementation, we would use ARI to send text back to the caller
    // For now, we just log it to stdout
  }

  close(): Promise<void> {
    return new Promise<void>(async (resolve) => {
      if (this.closing) {
        resolve();
        return;
      }
      this.closing = true;

      if (this.localChannel) {
        console.log("Hanging up local channel");
        try {
          await this.localChannel.hangup();
        } catch (error) {}
        delete this.localChannel;
      }
      if (this.externalChannel) {
        console.log("Hanging up external media channel");
        try {
          await this.externalChannel.hangup();
        } catch (error) {}
        delete this.externalChannel;
      }
      if (this.bridge) {
        console.log("Destroying bridge");
        try {
          await this.bridge.destroy();
        } catch (error) {}
        delete this.bridge;
      }

      if (this.options.closeCallback) {
        this.options.closeCallback();
      }
      await this.ari.stop();
      this.emit("close");
      resolve();
    });
  }

  connect(): Promise<void> {
    return new Promise<void>(async (resolve) => {
    this.ari = await client.connect(...ln([
      this.options.ariServerUrl,
      this.options.ariUser,
      this.options.ariPassword,
    ]));
    console.log('ari connected');

    await this.ari.start("externalMedia");

    // Create a simple bridge that is controlled by ARI/Stasis
    this.bridge = this.ari.Bridge();
    try {
      await this.bridge.create({ type: "mixing" });
    } catch (error) {
      console.error(error);
      this.close();
    }
    this.bridge.on("BridgeDestroyed", (event) => {
      this.close();
    });

    /*
     *  Create the local channel.  This actually creates 2
     *  back to back channels, one that's controlled by ARI/Stasis
     *  that we can put into the bridge we created above and
     *  another one the one that dials a phone, confbridge, etc.
     *  and joins _that_ bridge.
     *
     *  localChannel below is actually the first channel.
     */
    this.localChannel = this.ari.Channel();
    this.localChannel.on("StasisStart", (event, chan) => {
      this.bridge.addChannel({ channel: chan.id });
    });
    
    // Don't close the connection when StasisEnd is received for the local channel
    // This allows the RTT session to continue even after the initial message
    this.localChannel.on("StasisEnd", (event, chan) => {
      console.log("Local channel StasisEnd received, but keeping connection open");
    });

    // Call the phone or confbridge specified in dialstring
    try {
      await this.localChannel.originate(ln({
        endpoint: this.options.dialstring,
        formats: this.options.format,
        app: "externalMedia",
      }));
    } catch (error) {
      console.error(error);
      this.close();
    }

    // Now we create the External Media channel.
    this.externalChannel = this.ari.Channel();
    this.externalChannel.on("StasisStart", (event, chan) => {
      (async () => {
        await chan.answer();
        await this.bridge.addChannel({ channel: chan.id });
        console.log("External channel added to bridge");
      })().catch((err) => logger.error(err));
    });
    
    // Don't close the connection when StasisEnd is received for the external channel
    // This allows the RTT session to continue even after the initial message
    this.externalChannel.on("StasisEnd", (event, chan) => {
      console.log("External channel StasisEnd received, but keeping connection open");
    });

    /*
     * We give the external channel the address of the listener
     * we already set up and the format it should stream in.
     */
    try {
      let resp = await this.externalChannel.externalMedia({
        app: "externalMedia",
        external_host: process.env.RTP_HOST ? process.env.RTP_HOST.split(':')[0] + ':' + this.options.listenServer.split(':')[1] : this.options.listenServer,
        format: this.options.format,
      });
      this.emit("ready");
    } catch (error) {
      this.close();
    }
    resolve();
    });
  }
}
