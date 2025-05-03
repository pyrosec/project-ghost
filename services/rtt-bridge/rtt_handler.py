"""
SpiritLink RTT Bridge
RTT Handler for managing real-time text communication
"""

import asyncio
import json
import uuid
from typing import Dict, Any, Optional

import structlog
from fastapi import WebSocket

from aws_client import AWSBedrockClient
from agi_session import AGISession

logger = structlog.get_logger("spiritlink.rtt")

class RTTHandler:
    """
    Handler for RTT communication between Asterisk and AWS Bedrock
    """
    
    def __init__(self, aws_client: AWSBedrockClient) -> None:
        """
        Initialize RTT Handler
        
        Args:
            aws_client: AWS Bedrock client
        """
        self.aws_client = aws_client
        self.active_sessions: Dict[str, Dict[str, Any]] = {}
        
        logger.info("RTT Handler initialized")
    
    async def handle_agi_session(self, session: AGISession) -> None:
        """
        Handle AGI session for RTT communication
        
        Args:
            session: AGI session
        """
        # Generate conversation ID
        conversation_id = str(uuid.uuid4())
        
        # Create session context
        self.active_sessions[conversation_id] = {
            "channel_id": session.channel_id,
            "buffer": "",
            "last_response": "",
            "system_prompt": self._get_system_prompt()
        }
        
        logger.info(
            "RTT session started",
            conversation_id=conversation_id,
            channel_id=session.channel_id
        )
        
        try:
            # Send welcome message
            welcome_message = "Hello! I'm an AI assistant. How can I help you today?"
            await session.send_text(welcome_message)
            
            # Main communication loop
            while True:
                # Check if connection is still active
                try:
                    # Receive text from Asterisk
                    text = await session.receive_text()
                    
                    if text:
                        logger.debug(
                            "Received text from Asterisk",
                            text=text,
                            conversation_id=conversation_id
                        )
                        
                        # Buffer text until we have a complete message
                        self.active_sessions[conversation_id]["buffer"] += text
                        
                        # Check if we have a complete message (ends with newline or period)
                        buffer = self.active_sessions[conversation_id]["buffer"]
                        if buffer.endswith("\n") or buffer.endswith("."):
                            # Process the message
                            await self._process_message(conversation_id, buffer, session)
                            
                            # Clear buffer
                            self.active_sessions[conversation_id]["buffer"] = ""
                    
                    # Small delay to prevent CPU hogging
                    await asyncio.sleep(0.1)
                    
                except asyncio.CancelledError:
                    break
                except Exception as e:
                    logger.error(
                        "Error in RTT communication loop",
                        error=str(e),
                        conversation_id=conversation_id
                    )
                    break
        
        finally:
            # Clean up session
            if conversation_id in self.active_sessions:
                del self.active_sessions[conversation_id]
            
            logger.info(
                "RTT session ended",
                conversation_id=conversation_id,
                channel_id=session.channel_id
            )
    
    async def handle_websocket(self, websocket: WebSocket) -> None:
        """
        Handle WebSocket connection for RTT communication
        
        Args:
            websocket: WebSocket connection
        """
        # Generate conversation ID
        conversation_id = str(uuid.uuid4())
        
        # Create session context
        self.active_sessions[conversation_id] = {
            "channel_id": f"websocket-{conversation_id}",
            "buffer": "",
            "last_response": "",
            "system_prompt": self._get_system_prompt()
        }
        
        logger.info(
            "WebSocket RTT session started",
            conversation_id=conversation_id
        )
        
        try:
            # Send welcome message
            welcome_message = {
                "type": "message",
                "content": "Hello! I'm an AI assistant. How can I help you today?"
            }
            await websocket.send_text(json.dumps(welcome_message))
            
            # Main communication loop
            while True:
                # Receive message from WebSocket
                try:
                    message = await websocket.receive_text()
                    data = json.loads(message)
                    
                    if "message" in data:
                        user_message = data["message"]
                        
                        logger.debug(
                            "Received message from WebSocket",
                            message=user_message,
                            conversation_id=conversation_id
                        )
                        
                        # Generate response
                        system_prompt = self.active_sessions[conversation_id]["system_prompt"]
                        response_generator = self.aws_client.generate_response(
                            user_message,
                            conversation_id,
                            system_prompt
                        )
                        
                        # Stream response
                        full_response = ""
                        async for chunk in response_generator:
                            full_response += chunk
                            
                            # Send chunk to WebSocket
                            await websocket.send_text(json.dumps({
                                "type": "chunk",
                                "content": chunk
                            }))
                        
                        # Store last response
                        self.active_sessions[conversation_id]["last_response"] = full_response
                        
                        # Send end of response marker
                        await websocket.send_text(json.dumps({
                            "type": "end"
                        }))
                
                except asyncio.CancelledError:
                    break
                except Exception as e:
                    logger.error(
                        "Error in WebSocket communication loop",
                        error=str(e),
                        conversation_id=conversation_id
                    )
                    break
        
        finally:
            # Clean up session
            if conversation_id in self.active_sessions:
                del self.active_sessions[conversation_id]
            
            logger.info(
                "WebSocket RTT session ended",
                conversation_id=conversation_id
            )
    
    async def _process_message(
        self,
        conversation_id: str,
        message: str,
        session: AGISession
    ) -> None:
        """
        Process a message from Asterisk
        
        Args:
            conversation_id: Conversation ID
            message: Message to process
            session: AGI session
        """
        logger.info(
            "Processing message",
            message=message,
            conversation_id=conversation_id
        )
        
        # Get system prompt
        system_prompt = self.active_sessions[conversation_id]["system_prompt"]
        
        # Generate response
        response_generator = self.aws_client.generate_response(
            message,
            conversation_id,
            system_prompt
        )
        
        # Stream response to Asterisk
        full_response = ""
        async for chunk in response_generator:
            # Send chunk to Asterisk
            await session.send_text(chunk)
            
            # Accumulate full response
            full_response += chunk
        
        # Store last response
        self.active_sessions[conversation_id]["last_response"] = full_response
        
        logger.info(
            "Response sent",
            conversation_id=conversation_id,
            response_length=len(full_response)
        )
    
    def _get_system_prompt(self) -> str:
        """
        Get system prompt for AWS Bedrock
        
        Returns:
            System prompt
        """
        return (
            "You are a helpful AI assistant communicating via Real-Time Text (RTT). "
            "Keep your responses concise and clear. The user is typing in real-time, "
            "so they may send incomplete thoughts that get completed in subsequent messages. "
            "Be patient and wait for complete thoughts before responding fully. "
            "If the user seems to be having trouble with the RTT system, offer assistance."
        )