import { RTTBridge } from "./rtt-bridge";

/**
 * Main entry point for the RTT bridge service
 */
export async function run() {
  console.log("Starting RTT Bridge service");
  
  // Create RTT bridge instance
  const bridge = new RTTBridge({
    url: process.env.ARI_URI || 'http://asterisk:8088/ari',
    username: process.env.ARI_USERNAME || 'admin',
    password: process.env.ARI_PASSWORD || 'admin'
  });
  
  try {
    // Connect to Asterisk ARI
    console.log("Connecting to Asterisk ARI...");
    await bridge.connect();
    console.log("Connected to Asterisk ARI");
    
    // Listen for RTT text complete events
    bridge.on('rttTextComplete', (data) => {
      console.log(`Complete RTT message from channel ${data.channelId}: ${data.text}`);
      
      // You could add additional processing here, such as:
      // - Sending a response back to the caller
      // - Storing the text in a database
      // - Triggering other actions based on the text
    });
    
    // Keep the process running
    console.log("RTT Bridge service is running");
    
    // Handle process termination
    process.on('SIGINT', async () => {
      console.log("Shutting down RTT Bridge service");
      process.exit(0);
    });
    
    // Return the bridge instance
    return bridge;
  } catch (error) {
    console.error("Error starting RTT Bridge service:", error);
    process.exit(1);
  }
}

// If this file is run directly, start the service
if (require.main === module) {
  run().catch(error => {
    console.error("Unhandled error:", error);
    process.exit(1);
  });
}