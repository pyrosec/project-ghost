"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RTTBridge = void 0;
const ARI = __importStar(require("ari-client"));
const events_1 = require("events");
/**
 * RTT Bridge implementation for Asterisk
 * This class handles the RTT bridge functionality and logs RTT text to stdout
 */
class RTTBridge extends events_1.EventEmitter {
    constructor(ariConfig) {
        super();
        this.ariConfig = ariConfig;
        this.bridges = new Map();
        this.rttBuffers = new Map();
        this.rttTimers = new Map();
    }
    /**
     * Connect to the Asterisk ARI
     */
    async connect() {
        return new Promise((resolve, reject) => {
            ARI.connect(this.ariConfig.url, this.ariConfig.username, this.ariConfig.password, (err, client) => {
                if (err) {
                    reject(err);
                    return;
                }
                this.client = client;
                this.setupEventHandlers();
                resolve();
            });
        });
    }
    /**
     * Set up event handlers for ARI events
     */
    setupEventHandlers() {
        // Handle RTT text messages
        this.client.on('TextMessageReceived', (event) => {
            this.handleRTTText(event);
        });
        // Handle bridge destruction
        this.client.on('BridgeDestroyed', (event) => {
            const bridgeId = event.bridge.id;
            if (this.bridges.has(bridgeId)) {
                console.log(`RTT Bridge ${bridgeId} destroyed`);
                this.bridges.delete(bridgeId);
            }
        });
        // Handle channel end
        this.client.on('StasisEnd', (event) => {
            const channelId = event.channel.id;
            // Clean up any RTT buffers for this channel
            this.clearRTTBuffer(channelId);
        });
    }
    /**
     * Create a new bridge
     */
    async createBridge(options = { type: 'mixing' }) {
        const bridge = await this.client.bridges.create(options);
        this.bridges.set(bridge.id, bridge);
        console.log(`RTT Bridge created: ${bridge.id}`);
        return bridge.id;
    }
    /**
     * Add a channel to a bridge
     */
    async addChannelToBridge(bridgeId, channelId) {
        if (!this.bridges.has(bridgeId)) {
            throw new Error(`Bridge ${bridgeId} not found`);
        }
        const bridge = this.bridges.get(bridgeId);
        await bridge.addChannel({ channel: channelId });
        console.log(`Channel ${channelId} added to bridge ${bridgeId}`);
        // Initialize RTT buffer for this channel
        this.rttBuffers.set(channelId, '');
    }
    /**
     * Handle RTT text from a channel
     */
    handleRTTText(event) {
        const channelId = event.channel.id;
        const text = event.message.text;
        const bridgeId = this.findBridgeForChannel(channelId);
        if (!bridgeId) {
            return; // Channel not in any of our bridges
        }
        // Append to buffer
        const currentBuffer = this.rttBuffers.get(channelId) || '';
        const newBuffer = currentBuffer + text;
        this.rttBuffers.set(channelId, newBuffer);
        // Log RTT text to stdout
        const timestamp = new Date().toISOString();
        console.log(`[${timestamp}] RTT TEXT RECEIVED (Channel ${channelId}): ${text}`);
        // Set or reset timer to flush complete "words" or phrases
        this.resetRTTTimer(channelId, bridgeId);
    }
    /**
     * Reset the RTT timer for a channel
     */
    resetRTTTimer(channelId, bridgeId) {
        // Clear existing timer if any
        if (this.rttTimers.has(channelId)) {
            clearTimeout(this.rttTimers.get(channelId));
        }
        // Set new timer - after 1 second of inactivity, consider the current text complete
        const timer = setTimeout(() => {
            const buffer = this.rttBuffers.get(channelId);
            if (buffer && buffer.trim().length > 0) {
                // Emit an event for complete text
                this.emit('rttTextComplete', {
                    bridgeId,
                    channelId,
                    text: buffer
                });
                // Log complete text to stdout
                console.log(`RTT TEXT COMPLETE (Channel ${channelId}): ${buffer}`);
                // Reset buffer
                this.rttBuffers.set(channelId, '');
            }
            this.rttTimers.delete(channelId);
        }, 1000);
        this.rttTimers.set(channelId, timer);
    }
    /**
     * Clear the RTT buffer for a channel
     */
    clearRTTBuffer(channelId) {
        if (this.rttTimers.has(channelId)) {
            clearTimeout(this.rttTimers.get(channelId));
            this.rttTimers.delete(channelId);
        }
        this.rttBuffers.delete(channelId);
    }
    /**
     * Find the bridge ID for a channel
     */
    findBridgeForChannel(channelId) {
        for (const [bridgeId, bridge] of this.bridges.entries()) {
            if (bridge.channels && bridge.channels.includes(channelId)) {
                return bridgeId;
            }
        }
        return null;
    }
    /**
     * Destroy a bridge
     */
    async destroyBridge(bridgeId) {
        if (!this.bridges.has(bridgeId)) {
            throw new Error(`Bridge ${bridgeId} not found`);
        }
        const bridge = this.bridges.get(bridgeId);
        await bridge.destroy();
        // Cleanup will happen in the BridgeDestroyed event handler
    }
}
exports.RTTBridge = RTTBridge;
exports.default = RTTBridge;
//# sourceMappingURL=rtt-bridge.js.map