# Implementing an RTT-Enabled Bridge in Asterisk with TypeScript

This guide details how to implement a Real-Time Text (RTT) enabled bridge in Asterisk that can log incoming RTT text from an Asterisk dialplan triggered bridge application implemented in TypeScript.

## Table of Contents

- [Overview](#overview)
- [Prerequisites](#prerequisites)
- [Understanding RTT in Asterisk](#understanding-rtt-in-asterisk)
- [Implementation Steps](#implementation-steps)
  - [1. Setting Up the Asterisk Environment](#1-setting-up-the-asterisk-environment)
  - [2. Creating the TypeScript Bridge Application](#2-creating-the-typescript-bridge-application)
  - [3. Configuring Asterisk for RTT Support](#3-configuring-asterisk-for-rtt-support)
  - [4. Implementing the RTT Logging Mechanism](#4-implementing-the-rtt-logging-mechanism)
  - [5. Integrating with Asterisk Dialplan](#5-integrating-with-asterisk-dialplan)
- [Code Examples](#code-examples)
- [Testing and Troubleshooting](#testing-and-troubleshooting)
- [Advanced Features](#advanced-features)
- [References](#references)

## Overview

Real-Time Text (RTT) is a technology that allows text to be transmitted instantly while it's being typed, providing a more conversational experience compared to traditional text messaging. Implementing RTT in Asterisk allows for real-time text communication in VoIP environments, which is particularly valuable for accessibility purposes and in scenarios where voice communication isn't feasible.

This guide focuses on creating a bridge application in TypeScript that can be triggered from an Asterisk dialplan, establish an RTT-enabled bridge between two endpoints, and log all incoming RTT text for monitoring, analysis, or compliance purposes.

## Prerequisites

- Asterisk 16+ (with RTT support)
- Node.js (v14+)
- TypeScript (v4.0+)
- Asterisk REST Interface (ARI) enabled
- Asterisk Manager Interface (AMI) configured
- Basic knowledge of Asterisk dialplans
- Understanding of WebRTC and SIP protocols

## Understanding RTT in Asterisk

Asterisk supports RTT through the T.140 protocol over RTP. When RTT is enabled, text characters are transmitted in real-time as they are typed, rather than waiting for the sender to press "send" as in traditional text messaging.

Key concepts:
- **T.140**: The protocol used for real-time text transmission
- **RED (Redundant Encoding)**: Used to provide redundancy for RTT packets
- **RTP (Real-time Transport Protocol)**: The underlying transport protocol

Asterisk can handle RTT in several ways:
1. Pass-through mode (bridging RTT between endpoints)
2. Termination mode (where Asterisk processes the RTT)
3. Gateway mode (converting between RTT and other text protocols)

Our implementation will focus on the bridge mode with logging capabilities.

## Implementation Steps

### 1. Setting Up the Asterisk Environment

First, ensure Asterisk is compiled with RTT support:

```bash
./configure --with-rtt
make
make install
```

Verify RTT support is enabled:

```bash
asterisk -rx "core show build-options" | grep RTT
```

### 2. Creating the TypeScript Bridge Application

Our TypeScript application will use the Asterisk REST Interface (ARI) to create and manage bridges with RTT capabilities.

#### Project Setup

```bash
mkdir asterisk-rtt-bridge
cd asterisk-rtt-bridge
npm init -y
npm install --save ari-client typescript ts-node @types/node
npx tsc --init
```

#### Basic Application Structure

```typescript
// src/index.ts
import * as ARI from 'ari-client';
import { EventEmitter } from 'events';

class RTTBridge extends EventEmitter {
  private client: any;
  private bridge: any;
  private logger: RTTLogger;

  constructor(ariConfig: AriConfig, loggerConfig: LoggerConfig) {
    super();
    this.logger = new RTTLogger(loggerConfig);
  }

  async connect(): Promise<void> {
    // Connect to Asterisk ARI
  }

  async createBridge(bridgeOptions: BridgeOptions): Promise<string> {
    // Create an RTT-enabled bridge
  }

  async addChannelToBridge(bridgeId: string, channelId: string): Promise<void> {
    // Add a channel to the bridge
  }

  async monitorRTTText(bridgeId: string): Promise<void> {
    // Monitor and log RTT text
  }

  // Additional methods...
}

// Types and interfaces
interface AriConfig {
  url: string;
  username: string;
  password: string;
}

interface LoggerConfig {
  outputPath: string;
  format: string;
}

interface BridgeOptions {
  type: string;
  name?: string;
}

// RTT Logger class
class RTTLogger {
  // Implementation details
}

// Export the main class
export default RTTBridge;
```

### 3. Configuring Asterisk for RTT Support

#### SIP Configuration (pjsip.conf)

```ini
[endpoint-template](!)
type=endpoint
context=default
disallow=all
allow=opus,g722,ulaw
allow=t140,t140red
direct_media=no
rtp_timeout=30
dtmf_mode=rfc4733
media_encryption=dtls
dtls_cert_file=/etc/asterisk/keys/asterisk.crt
dtls_private_key=/etc/asterisk/keys/asterisk.key
dtls_verify=fingerprint
dtls_setup=actpass
ice_support=yes
media_use_received_transport=yes
rtcp_mux=yes
bundle=yes
t140_redundancy=3  ; Enable T.140 redundancy with 3 generations

[webrtc-client](endpoint-template)
transport=transport-wss
aors=webrtc-client

[webrtc-client]
type=aor
max_contacts=5
remove_existing=yes
```

#### Enable ARI (ari.conf)

```ini
[general]
enabled=yes
pretty=yes

[rtt-bridge]
type=user
password=your_secure_password
password_format=plain
read_only=no
```

### 4. Implementing the RTT Logging Mechanism

The core of our implementation is the RTT logging mechanism. We'll use ARI events to capture RTT text:

```typescript
// src/rtt-logger.ts
import * as fs from 'fs';
import * as path from 'path';

export class RTTLogger {
  private outputPath: string;
  private format: string;
  private fileStreams: Map<string, fs.WriteStream>;

  constructor(config: LoggerConfig) {
    this.outputPath = config.outputPath;
    this.format = config.format || 'json';
    this.fileStreams = new Map();
    
    // Ensure output directory exists
    if (!fs.existsSync(this.outputPath)) {
      fs.mkdirSync(this.outputPath, { recursive: true });
    }
  }

  public startSessionLog(sessionId: string, metadata: any): fs.WriteStream {
    const filename = path.join(this.outputPath, `rtt_session_${sessionId}_${Date.now()}.${this.format}`);
    const stream = fs.createWriteStream(filename, { flags: 'a' });
    
    // Write session metadata
    if (this.format === 'json') {
      stream.write(JSON.stringify({ 
        type: 'session_start', 
        timestamp: new Date().toISOString(),
        sessionId,
        metadata
      }) + '\n');
    } else {
      stream.write(`SESSION START: ${sessionId}\nTimestamp: ${new Date().toISOString()}\n`);
      Object.entries(metadata).forEach(([key, value]) => {
        stream.write(`${key}: ${value}\n`);
      });
      stream.write('--- RTT TRANSCRIPT BEGINS ---\n');
    }
    
    this.fileStreams.set(sessionId, stream);
    return stream;
  }

  public logRTTText(sessionId: string, channelId: string, text: string): void {
    const stream = this.fileStreams.get(sessionId);
    if (!stream) {
      console.error(`No log stream found for session ${sessionId}`);
      return;
    }
    
    const entry = {
      type: 'rtt_text',
      timestamp: new Date().toISOString(),
      channelId,
      text
    };
    
    if (this.format === 'json') {
      stream.write(JSON.stringify(entry) + '\n');
    } else {
      stream.write(`[${entry.timestamp}] Channel ${channelId}: ${text}\n`);
    }
  }

  public endSessionLog(sessionId: string): void {
    const stream = this.fileStreams.get(sessionId);
    if (!stream) {
      return;
    }
    
    if (this.format === 'json') {
      stream.write(JSON.stringify({ 
        type: 'session_end', 
        timestamp: new Date().toISOString(),
        sessionId
      }) + '\n');
    } else {
      stream.write(`--- RTT TRANSCRIPT ENDS ---\n`);
      stream.write(`SESSION END: ${sessionId}\nTimestamp: ${new Date().toISOString()}\n`);
    }
    
    stream.end();
    this.fileStreams.delete(sessionId);
  }
}

interface LoggerConfig {
  outputPath: string;
  format?: 'json' | 'text';
}
```

### 5. Integrating with Asterisk Dialplan

Create a dialplan that can trigger our TypeScript bridge application:

```
[rtt-bridge]
exten => start,1,NoOp(Starting RTT Bridge)
same => n,Set(BRIDGE_ID=${SHELL(node /path/to/create-bridge.js)})
same => n,NoOp(Created bridge: ${BRIDGE_ID})
same => n,Set(CHANNEL(hangup_handler_push)=rtt-bridge,cleanup,1(${BRIDGE_ID}))
same => n,Bridge(${BRIDGE_ID})
same => n,Hangup()

exten => cleanup,1,NoOp(Cleaning up RTT Bridge: ${ARG1})
same => n,System(node /path/to/cleanup-bridge.js ${ARG1})
same => n,Return()
```

## Code Examples

### Complete TypeScript Bridge Implementation

```typescript
// src/index.ts
import * as ARI from 'ari-client';
import { EventEmitter } from 'events';
import { RTTLogger } from './rtt-logger';

export class RTTBridge extends EventEmitter {
  private client: any;
  private bridges: Map<string, any>;
  private logger: RTTLogger;
  private rttBuffers: Map<string, string>;
  private rttTimers: Map<string, NodeJS.Timeout>;

  constructor(private ariConfig: AriConfig, loggerConfig: LoggerConfig) {
    super();
    this.bridges = new Map();
    this.rttBuffers = new Map();
    this.rttTimers = new Map();
    this.logger = new RTTLogger(loggerConfig);
  }

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

  private setupEventHandlers(): void {
    this.client.on('TextMessageReceived', (event: any) => {
      this.handleRTTText(event);
    });
    
    this.client.on('BridgeDestroyed', (event: any) => {
      const bridgeId = event.bridge.id;
      if (this.bridges.has(bridgeId)) {
        this.logger.endSessionLog(bridgeId);
        this.bridges.delete(bridgeId);
      }
    });
    
    this.client.on('StasisEnd', (event: any) => {
      const channelId = event.channel.id;
      // Clean up any RTT buffers for this channel
      this.clearRTTBuffer(channelId);
    });
  }

  async createBridge(options: BridgeOptions = { type: 'mixing' }): Promise<string> {
    const bridge = await this.client.bridges.create(options);
    this.bridges.set(bridge.id, bridge);
    
    // Start a new log session
    this.logger.startSessionLog(bridge.id, {
      createdAt: new Date().toISOString(),
      bridgeType: options.type,
      bridgeName: options.name || 'unnamed'
    });
    
    return bridge.id;
  }

  async addChannelToBridge(bridgeId: string, channelId: string): Promise<void> {
    if (!this.bridges.has(bridgeId)) {
      throw new Error(`Bridge ${bridgeId} not found`);
    }
    
    const bridge = this.bridges.get(bridgeId);
    await bridge.addChannel({ channel: channelId });
    
    // Initialize RTT buffer for this channel
    this.rttBuffers.set(channelId, '');
  }

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
    
    // Log immediately for real-time character updates
    this.logger.logRTTText(bridgeId, channelId, text);
    
    // Set or reset timer to flush complete "words" or phrases
    this.resetRTTTimer(channelId, bridgeId);
  }

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
        
        // Reset buffer
        this.rttBuffers.set(channelId, '');
      }
      this.rttTimers.delete(channelId);
    }, 1000);
    
    this.rttTimers.set(channelId, timer);
  }

  private clearRTTBuffer(channelId: string): void {
    if (this.rttTimers.has(channelId)) {
      clearTimeout(this.rttTimers.get(channelId));
      this.rttTimers.delete(channelId);
    }
    this.rttBuffers.delete(channelId);
  }

  private findBridgeForChannel(channelId: string): string | null {
    for (const [bridgeId, bridge] of this.bridges.entries()) {
      if (bridge.channels && bridge.channels.includes(channelId)) {
        return bridgeId;
      }
    }
    return null;
  }

  async destroyBridge(bridgeId: string): Promise<void> {
    if (!this.bridges.has(bridgeId)) {
      throw new Error(`Bridge ${bridgeId} not found`);
    }
    
    const bridge = this.bridges.get(bridgeId);
    await bridge.destroy();
    
    // Cleanup will happen in the BridgeDestroyed event handler
  }
}

// Helper script for dialplan integration
if (require.main === module) {
  const command = process.argv[2];
  const args = process.argv.slice(3);
  
  const config = {
    ari: {
      url: 'http://localhost:8088',
      username: 'rtt-bridge',
      password: 'your_secure_password'
    },
    logger: {
      outputPath: '/var/log/asterisk/rtt-logs',
      format: 'json'
    }
  };
  
  const bridge = new RTTBridge(config.ari, config.logger);
  
  async function main() {
    await bridge.connect();
    
    switch (command) {
      case 'create':
        const bridgeId = await bridge.createBridge({ 
          type: 'mixing',
          name: args[0] || `rtt-bridge-${Date.now()}`
        });
        console.log(bridgeId); // Output for dialplan
        break;
        
      case 'add':
        await bridge.addChannelToBridge(args[0], args[1]);
        break;
        
      case 'destroy':
        await bridge.destroyBridge(args[0]);
        break;
        
      default:
        console.error('Unknown command. Use: create, add, or destroy');
        process.exit(1);
    }
  }
  
  main().catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
}

// Types and interfaces
interface AriConfig {
  url: string;
  username: string;
  password: string;
}

interface LoggerConfig {
  outputPath: string;
  format?: 'json' | 'text';
}

interface BridgeOptions {
  type: string;
  name?: string;
}

export default RTTBridge;
```

### Command-line Scripts for Dialplan Integration

```typescript
// src/create-bridge.ts
import { RTTBridge } from './index';

const config = {
  ari: {
    url: 'http://localhost:8088',
    username: 'rtt-bridge',
    password: 'your_secure_password'
  },
  logger: {
    outputPath: '/var/log/asterisk/rtt-logs',
    format: 'json'
  }
};

async function createBridge() {
  const bridge = new RTTBridge(config.ari, config.logger);
  await bridge.connect();
  
  const bridgeId = await bridge.createBridge({
    type: 'mixing',
    name: `rtt-bridge-${Date.now()}`
  });
  
  console.log(bridgeId); // Output for dialplan
  process.exit(0);
}

createBridge().catch(err => {
  console.error('Error creating bridge:', err);
  process.exit(1);
});
```

```typescript
// src/cleanup-bridge.ts
import { RTTBridge } from './index';

const bridgeId = process.argv[2];
if (!bridgeId) {
  console.error('Bridge ID required');
  process.exit(1);
}

const config = {
  ari: {
    url: 'http://localhost:8088',
    username: 'rtt-bridge',
    password: 'your_secure_password'
  },
  logger: {
    outputPath: '/var/log/asterisk/rtt-logs',
    format: 'json'
  }
};

async function cleanupBridge() {
  const bridge = new RTTBridge(config.ari, config.logger);
  await bridge.connect();
  
  try {
    await bridge.destroyBridge(bridgeId);
    console.log(`Bridge ${bridgeId} destroyed`);
  } catch (err) {
    console.error(`Error destroying bridge ${bridgeId}:`, err);
  }
  
  process.exit(0);
}

cleanupBridge().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
```

## Testing and Troubleshooting

### Testing RTT Support

1. Use SIPp with RTT scenarios to test RTT capabilities
2. Use WebRTC clients that support RTT (like SIPML5 with RTT extensions)
3. Monitor RTP packets with Wireshark to verify T.140 traffic

### Common Issues and Solutions

1. **No RTT text is being received**
   - Verify that endpoints support T.140
   - Check SDP negotiation in SIP messages
   - Ensure RTT is enabled in endpoint configuration

2. **RTT text is delayed or missing characters**
   - Increase T.140 redundancy setting
   - Check network conditions for packet loss
   - Verify RTP timing settings

3. **Bridge not receiving RTT events**
   - Ensure ARI is properly configured
   - Check that the application is subscribed to TextMessageReceived events
   - Verify that the bridge is properly created and channels are added

## Advanced Features

### RTT Translation

Extend the bridge to support real-time translation of RTT text:

```typescript
// Example integration with translation API
async function translateRTTText(text: string, sourceLang: string, targetLang: string): Promise<string> {
  // Implementation with your preferred translation API
}

// Add to RTTBridge class
this.on('rttTextComplete', async (data) => {
  if (this.translationEnabled) {
    const translated = await translateRTTText(data.text, 'en', 'es');
    this.logger.logRTTText(data.bridgeId, `${data.channelId}-translated`, translated);
  }
});
```

### RTT Analytics

Implement analytics to gain insights from RTT conversations:

```typescript
class RTTAnalytics {
  analyzeConversation(logPath: string): Promise<AnalyticsResult> {
    // Implementation to analyze RTT logs
    // - Response times
    // - Typing speed
    // - Conversation flow
    // - Sentiment analysis
  }
}
```

### Integration with Speech-to-Text

Create a more accessible communication environment by combining RTT with speech-to-text:

```typescript
// In RTTBridge class
async setupSpeechToText(channelId: string): Promise<void> {
  const channel = this.client.channels.get({ channelId });
  await channel.externalMedia({
    app: 'rtt-bridge',
    external_host: 'localhost:8001',
    format: 'slin16'
  });
  
  // Setup STT service and pipe audio
  // When text is recognized, send it as RTT
}
```

## References

- [Asterisk RTT Documentation](https://wiki.asterisk.org/wiki/display/AST/Real-time+Text+%28RTT%29)
- [T.140 Protocol Specification](https://www.itu.int/rec/T-REC-T.140/en)
- [WebRTC RTT Implementation Guide](https://www.w3.org/TR/webrtc-nv-use-cases/#rtt)
- [Asterisk ARI Documentation](https://wiki.asterisk.org/wiki/display/AST/Asterisk+REST+Interface+%28ARI%29+Documentation)
- [TypeScript Documentation](https://www.typescriptlang.org/docs/)
- [Node.js ARI Client](https://github.com/asterisk/node-ari-client)
