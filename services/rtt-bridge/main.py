#!/usr/bin/env python3
"""
SpiritLink RTT Bridge
Main application entry point
"""

import asyncio
import json
import logging
import os
import signal
import sys
from typing import Dict, Any, Optional

from dotenv import load_dotenv
from fastapi import FastAPI, WebSocket
from fastapi.responses import JSONResponse
import redis.asyncio as redis
import uvicorn

from agi_server import AGIServer
from asterisk_ami import AsteriskAMI
from aws_client import AWSBedrockClient
from rtt_handler import RTTHandler
from tty_session_manager import TTYSessionManager
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

# Redis client (will be initialized on startup)
redis_client: Optional[redis.Redis] = None

# AMI client
ami_client = AsteriskAMI()

# TTY Session Manager (will be initialized after Redis connects)
tty_manager: Optional[TTYSessionManager] = None

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


async def tty_queue_processor() -> None:
    """Process commands from tty-out Redis queue"""
    global tty_manager, redis_client

    logger.info("TTY queue processor started")

    while True:
        try:
            if not redis_client or not tty_manager:
                await asyncio.sleep(1)
                continue

            # Block for up to 1 second waiting for commands
            result = await redis_client.blpop('tty-out', timeout=1)

            if result:
                _, data = result
                try:
                    command = json.loads(data)
                    logger.info("Processing TTY command", action=command.get("action"))
                    await tty_manager.process_command(command)
                except json.JSONDecodeError as e:
                    logger.error("Invalid TTY command JSON", error=str(e))
                except Exception as e:
                    logger.error("Error processing TTY command", error=str(e))

        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.error("TTY queue processor error", error=str(e))
            await asyncio.sleep(1)

    logger.info("TTY queue processor stopped")


async def init_redis() -> redis.Redis:
    """Initialize Redis connection"""
    redis_uri = os.getenv("REDIS_URI", "redis://redis:6379")
    logger.info("Connecting to Redis", uri=redis_uri)
    client = redis.from_url(redis_uri, decode_responses=True)
    await client.ping()
    logger.info("Redis connected")
    return client


async def init_ami() -> bool:
    """Initialize AMI connection"""
    logger.info("Connecting to Asterisk AMI")
    success = await ami_client.connect()
    if success:
        logger.info("AMI connected")
    else:
        logger.error("AMI connection failed")
    return success


async def shutdown(signal: signal.Signals) -> None:
    """Shutdown the application gracefully"""
    logger.info(f"Received exit signal {signal.name}...")

    # Disconnect AMI
    await ami_client.disconnect()

    # Close Redis
    if redis_client:
        await redis_client.close()

    # Stop the AGI server
    await agi_server.stop()

    # Exit
    logger.info("Application shutdown complete")


async def main() -> None:
    """Main application entry point"""
    global redis_client, tty_manager

    # Setup signal handlers
    for sig in (signal.SIGTERM, signal.SIGINT):
        asyncio.get_event_loop().add_signal_handler(
            sig, lambda sig=sig: asyncio.create_task(shutdown(sig))
        )

    # Initialize Redis
    try:
        redis_client = await init_redis()
    except Exception as e:
        logger.error("Failed to connect to Redis", error=str(e))
        sys.exit(1)

    # Initialize TTY Session Manager
    tty_manager = TTYSessionManager(redis_client, ami_client)

    # Set TTY manager on AGI server for session callbacks
    agi_server.set_tty_manager(tty_manager)

    # Initialize AMI (non-fatal if fails - will retry)
    await init_ami()
    if ami_client.connected:
        tty_manager.set_ami_client(ami_client)

    # Start the AGI server
    asyncio.create_task(start_agi_server())

    # Start TTY queue processor
    asyncio.create_task(tty_queue_processor())

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