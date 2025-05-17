#!/usr/bin/env python3
"""
GhoulBridge - DTMF Handling Bridge for Asterisk
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

from dtmf_handler import DTMFHandler
from stasis_handler import StasisHandler
from logger import setup_logger

# Load environment variables
load_dotenv()

# Setup logging
logger = setup_logger()

# Create FastAPI app
app = FastAPI(title="GhoulBridge DTMF Handler")

# Create DTMF handler
dtmf_handler = DTMFHandler()

# Create Stasis handler
stasis_handler = StasisHandler(dtmf_handler)

@app.get("/")
async def root() -> Dict[str, str]:
    """Root endpoint"""
    return {"status": "ok", "service": "GhoulBridge DTMF Handler"}

@app.get("/health")
async def health() -> Dict[str, str]:
    """Health check endpoint"""
    return {"status": "healthy"}

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket) -> None:
    """WebSocket endpoint for direct DTMF communication"""
    await websocket.accept()
    try:
        await dtmf_handler.handle_websocket(websocket)
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
    finally:
        await websocket.close()

async def start_stasis_handler() -> None:
    """Start the Stasis handler"""
    await stasis_handler.start()

async def shutdown(signal: signal.Signals) -> None:
    """Shutdown the application gracefully"""
    logger.info(f"Received exit signal {signal.name}...")
    
    # Stop the Stasis handler
    await stasis_handler.stop()
    
    # Exit
    logger.info("Application shutdown complete")

async def main() -> None:
    """Main application entry point"""
    # Setup signal handlers
    for sig in (signal.SIGTERM, signal.SIGINT):
        asyncio.get_event_loop().add_signal_handler(
            sig, lambda sig=sig: asyncio.create_task(shutdown(sig))
        )
    
    # Start the Stasis handler
    asyncio.create_task(start_stasis_handler())
    
    # Start the FastAPI server
    config = uvicorn.Config(
        app=app,
        host="0.0.0.0",
        port=8086,
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