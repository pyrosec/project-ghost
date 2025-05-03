"""
SpiritLink RTT Bridge
AGI Session for handling Asterisk Gateway Interface sessions
"""

import asyncio
from typing import Dict, Any, Optional

import structlog

logger = structlog.get_logger("spiritlink.agi.session")

class AGISession:
    """
    AGI Session for handling a single AGI request
    """
    
    def __init__(
        self,
        reader: asyncio.StreamReader,
        writer: asyncio.StreamWriter,
        agi_env: Dict[str, str]
    ) -> None:
        """
        Initialize AGI Session
        
        Args:
            reader: Stream reader
            writer: Stream writer
            agi_env: AGI environment variables
        """
        self.reader = reader
        self.writer = writer
        self.agi_env = agi_env
        self.channel_id = agi_env.get("agi_channel", "unknown")
        
        logger.info("AGI Session created", channel_id=self.channel_id)
    
    async def read_line(self) -> str:
        """
        Read a line from Asterisk
        
        Returns:
            Line read from Asterisk
        """
        line = await self.reader.readline()
        return line.decode().strip()
    
    async def write_line(self, line: str) -> None:
        """
        Write a line to Asterisk
        
        Args:
            line: Line to write
        """
        self.writer.write(f"{line}\n".encode())
        await self.writer.drain()
    
    async def execute_command(self, command: str) -> Dict[str, Any]:
        """
        Execute an AGI command
        
        Args:
            command: Command to execute
            
        Returns:
            Command result
        """
        await self.write_line(command)
        response = await self.read_line()
        
        result = {
            "raw": response
        }
        
        if response.startswith("200"):
            parts = response.split(" ", 3)
            result["code"] = 200
            result["result"] = int(parts[1])
            if len(parts) > 3:
                result["data"] = parts[3]
        else:
            result["code"] = int(response.split(" ")[0])
        
        return result
    
    async def receive_text(self) -> Optional[str]:
        """
        Receive text from Asterisk channel
        
        Returns:
            Text received or None
        """
        result = await self.execute_command("RECEIVE TEXT")
        if result["code"] == 200 and "data" in result:
            return result["data"]
        return None
    
    async def send_text(self, text: str) -> bool:
        """
        Send text to Asterisk channel
        
        Args:
            text: Text to send
            
        Returns:
            True if successful, False otherwise
        """
        result = await self.execute_command(f"SEND TEXT \"{text}\"")
        return result["code"] == 200