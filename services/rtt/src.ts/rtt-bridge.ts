import * as ARI from 'ari-client';
import { EventEmitter } from 'events';

/**
 * RTT Bridge implementation for Asterisk
 * This class handles the RTT bridge functionality and logs RTT text to stdout
 */
export class RTTBridge extends EventEmitter {
  private client: any;
  private bridges: Map<string, any>;
  private rttBuffers: Map<string, string>;
  private rttTimers: Map<string, NodeJS.Timeout>;

  constructor(private ariConfig: AriConfig) {
    super();
    this.bridges = new Map();
    this.rttBuffers = new Map();
    this.rttTimers = new Map();
  }

  /**
   * Connect to the Asterisk ARI
   */
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      ARI.connect(
        this.ariConfig.url,
        this.ariConfig.username,
        this.ariConfig.password,
        (err, client) => {
          if (err) {
            reject(err);
            return;
          }
          
          this.client = client;
          this.setupEventHandlers();
          resolve();
        }
      );
    });
  }

  /**
   * Set up event handlers for ARI events
   */
  private setupEventHandlers(): void {
    // Handle RTT text messages
    this.client.on('TextMessageReceived', (event: any) => {
      this.handleRTTText(event);
    });
    
    // Handle bridge destruction
    this.client.on('BridgeDestroyed', (event: any) => {
      const bridgeId = event.bridge.id;
      if (this.bridges.has(bridgeId)) {
        console.log(`RTT Bridge ${bridgeId} destroyed`);
        this.bridges.delete(bridgeId);
      }
    });
    
    // Handle channel end
    this.client.on('StasisEnd', (event: any) => {
      const channelId = event.channel.id;
      // Clean up any RTT buffers for this channel
      this.clearRTTBuffer(channelId);
    });
  }

  /**
   * Create a new bridge
   */
  async createBridge(options: BridgeOptions = { type: 'mixing' }): Promise<string> {
    const bridge = await this.client.bridges.create(options);
    this.bridges.set(bridge.id, bridge);
    
    console.log(`RTT Bridge created: ${bridge.id}`);
    
    return bridge.id;
  }

  /**
   * Add a channel to a bridge
   */
  async addChannelToBridge(bridgeId: string, channelId: string): Promise<void> {
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
  private handleRTTText(event: any): void {
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
  private resetRTTTimer(channelId: string, bridgeId: string): void {
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
  private clearRTTBuffer(channelId: string): void {
    if (this.rttTimers.has(channelId)) {
      clearTimeout(this.rttTimers.get(channelId));
      this.rttTimers.delete(channelId);
    }
    this.rttBuffers.delete(channelId);
  }

  /**
   * Find the bridge ID for a channel
   */
  private findBridgeForChannel(channelId: string): string | null {
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
  async destroyBridge(bridgeId: string): Promise<void> {
    if (!this.bridges.has(bridgeId)) {
      throw new Error(`Bridge ${bridgeId} not found`);
    }
    
    const bridge = this.bridges.get(bridgeId);
    await bridge.destroy();
    
    // Cleanup will happen in the BridgeDestroyed event handler
  }
}

// Types and interfaces
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