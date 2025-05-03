#!/usr/bin/env python3
"""
SpiritLink RTT Bridge
Main application entry point
"""

import asyncio
import logging
import os
import signal
import sys
from typing import Dict, Any

from dotenv import load_dotenv
from fastapi import FastAPI, WebSocket
from fastapi.responses import JSONResponse
import uvicorn

from agi_server import AGIServer
from aws_client import AWSBedrockClient
from rtt_handler import RTTHandler
from logger import setup_logger

# Load environment variables
load_dotenv()

# Setup logging
logger = setup_logger()

# Create FastAPI app
app = FastAPI(title="SpiritLink RTT Bridge")

# Create AWS Bedrock client
aws_client = AWSBedrockClient(
    access_key=os.getenv("AWS_ACCESS_KEY"),
    secret_key=os.getenv("AWS_SECRET_KEY"),
    region=os.getenv("AWS_REGION", "us-west-2"),
    cross_region=os.getenv("AWS_CROSS_REGION_INFERENCE", "no").lower() == "yes",
    model=os.getenv("AWS_MODEL")
)

# Create RTT handler
rtt_handler = RTTHandler(aws_client)

# Create AGI server
agi_server = AGIServer(rtt_handler)

@app.get("/")
async def root() -> Dict[str, str]:
    """Root endpoint"""
    return {"status": "ok", "service": "SpiritLink RTT Bridge"}

@app.get("/health")
async def health() -> Dict[str, str]:
    """Health check endpoint"""
    return {"status": "healthy"}

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket) -> None:
    """WebSocket endpoint for direct RTT communication"""
    await websocket.accept()
    try:
        await rtt_handler.handle_websocket(websocket)
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
    finally:
        await websocket.close()

async def start_agi_server() -> None:
    """Start the AGI server"""
    await agi_server.start()

async def shutdown(signal: signal.Signals) -> None:
    """Shutdown the application gracefully"""
    logger.info(f"Received exit signal {signal.name}...")
    
    # Stop the AGI server
    await agi_server.stop()
    
    # Exit
    logger.info("Application shutdown complete")

async def main() -> None:
    """Main application entry point"""
    # Setup signal handlers
    for sig in (signal.SIGTERM, signal.SIGINT):
        asyncio.get_event_loop().add_signal_handler(
            sig, lambda sig=sig: asyncio.create_task(shutdown(sig))
        )
    
    # Start the AGI server
    asyncio.create_task(start_agi_server())
    
    # Start the FastAPI server
    config = uvicorn.Config(
        app=app,
        host="0.0.0.0",
        port=8080,
        log_level=os.getenv("LOG_LEVEL", "info").lower(),
    )
    server = uvicorn.Server(config)
    await server.serve()

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("Application stopped by user")
    except Exception as e:
        logger.error(f"Application error: {e}")
        sys.exit(1)