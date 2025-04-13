/// <reference types="node" />
import { EventEmitter } from 'events';
/**
 * RTT Bridge implementation for Asterisk
 * This class handles the RTT bridge functionality and logs RTT text to stdout
 */
export declare class RTTBridge extends EventEmitter {
    private ariConfig;
    private client;
    private bridges;
    private rttBuffers;
    private rttTimers;
    constructor(ariConfig: AriConfig);
    /**
     * Connect to the Asterisk ARI
     */
    connect(): Promise<void>;
    /**
     * Set up event handlers for ARI events
     */
    private setupEventHandlers;
    /**
     * Create a new bridge
     */
    createBridge(options?: BridgeOptions): Promise<string>;
    /**
     * Add a channel to a bridge
     */
    addChannelToBridge(bridgeId: string, channelId: string): Promise<void>;
    /**
     * Handle RTT text from a channel
     */
    private handleRTTText;
    /**
     * Reset the RTT timer for a channel
     */
    private resetRTTTimer;
    /**
     * Clear the RTT buffer for a channel
     */
    private clearRTTBuffer;
    /**
     * Find the bridge ID for a channel
     */
    private findBridgeForChannel;
    /**
     * Destroy a bridge
     */
    destroyBridge(bridgeId: string): Promise<void>;
}
interface AriConfig {
    url: string;
    username: string;
    password: string;
}
interface BridgeOptions {
    type: string;
    name?: string;
}
export default RTTBridge;
