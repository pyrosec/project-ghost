#!/usr/bin/env node

/**
 * RTT Bridge Service
 * 
 * This script starts the RTT bridge service that logs RTT text to stdout.
 */

// Import the run function from the compiled JavaScript file
const { run } = require('../lib/run');

// Start the RTT bridge service
console.log('Starting RTT Bridge Service...');
run().catch(error => {
  console.error('Error starting RTT Bridge Service:', error);
  process.exit(1);
});

// Handle process termination
process.on('SIGINT', () => {
  console.log('RTT Bridge Service shutting down...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('RTT Bridge Service shutting down...');
  process.exit(0);
});
