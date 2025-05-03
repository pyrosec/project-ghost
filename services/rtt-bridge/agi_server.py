"""
SpiritLink RTT Bridge
AGI Server for Asterisk integration
"""

import asyncio
import socket
from typing import Dict, Any, Optional, List, Tuple

import structlog

from agi_session import AGISession
from rtt_handler import RTTHandler

logger = structlog.get_logger("spiritlink.agi")

class AGIServer:
    """
    AGI Server for handling Asterisk AGI requests
    """
    
    def __init__(self, rtt_handler: RTTHandler, host: str = "0.0.0.0", port: int = 4573) -> None:
        """
        Initialize AGI Server
        
        Args:
            rtt_handler: RTT handler instance
            host: Host to bind to
            port: Port to bind to
        """
        self.rtt_handler = rtt_handler
        self.host = host
        self.port = port
        self.server = None
        self.clients: List[Tuple[asyncio.StreamReader, asyncio.StreamWriter]] = []
        
        logger.info("AGI Server initialized", host=host, port=port)
    
    async def start(self) -> None:
        """Start the AGI server"""
        self.server = await asyncio.start_server(
            self.handle_client, self.host, self.port
        )
        
        logger.info("AGI Server started", host=self.host, port=self.port)
        
        async with self.server:
            await self.server.serve_forever()
    
    async def stop(self) -> None:
        """Stop the AGI server"""
        if self.server:
            self.server.close()
            await self.server.wait_closed()
            
            # Close all client connections
            for reader, writer in self.clients:
                writer.close()
                await writer.wait_closed()
            
            self.clients = []
            
            logger.info("AGI Server stopped")
    
    async def handle_client(self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
        """
        Handle AGI client connection
        
        Args:
            reader: Stream reader
            writer: Stream writer
        """
        # Add client to list
        self.clients.append((reader, writer))
        
        # Get client address
        addr = writer.get_extra_info("peername")
        logger.info("AGI client connected", addr=addr)
        
        # Parse AGI environment
        agi_env = await self.parse_agi_environment(reader)
        
        # Create AGI session
        session = AGISession(reader, writer, agi_env)
        
        try:
            # Handle RTT session
            await self.rtt_handler.handle_agi_session(session)
        except Exception as e:
            logger.error("Error handling AGI session", error=str(e))
        finally:
            # Close connection
            writer.close()
            await writer.wait_closed()
            
            # Remove client from list
            self.clients.remove((reader, writer))
            
            logger.info("AGI client disconnected", addr=addr)
    
    async def parse_agi_environment(self, reader: asyncio.StreamReader) -> Dict[str, str]:
        """
        Parse AGI environment variables
        
        Args:
            reader: Stream reader
            
        Returns:
            Dict of AGI environment variables
        """
        agi_env = {}
        
        while True:
            line = await reader.readline()
            line = line.decode().strip()
            
            if not line:
                break
                
            if ":" in line:
                key, value = line.split(":", 1)
                agi_env[key.strip()] = value.strip()
        
        logger.debug("Parsed AGI environment", agi_env=agi_env)
        return agi_env