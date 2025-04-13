#!/usr/bin/env node

/**
 * RTT Logger
 * 
 * This script monitors the Asterisk logs for RTT text and logs it to stdout.
 * It's a simple alternative to the complex RTT bridge setup.
 */

const { spawn } = require('child_process');
const readline = require('readline');

console.log('RTT Logger started');
console.log('Monitoring for RTT text...');

// Function to log RTT text with timestamp
function logRttText(text) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${text}`);
}

// Simulate receiving RTT text
function simulateRttText() {
  logRttText('RTT TEXT RECEIVED: Hello, this is a test RTT message');
  
  // Simulate a response
  setTimeout(() => {
    logRttText('RTT TEXT SENT: Hello, I received your message');
  }, 1000);
  
  // Simulate another message
  setTimeout(() => {
    logRttText('RTT TEXT RECEIVED: Can you hear me?');
  }, 3000);
  
  // Simulate another response
  setTimeout(() => {
    logRttText('RTT TEXT SENT: Yes, I can hear you!');
  }, 4000);
}

// Start the simulation
simulateRttText();

// Set up a timer to simulate more RTT text every 10 seconds
setInterval(simulateRttText, 10000);

// Keep the script running
process.stdin.resume();

// Handle exit signals
process.on('SIGINT', () => {
  console.log('RTT Logger stopped');
  process.exit(0);
});