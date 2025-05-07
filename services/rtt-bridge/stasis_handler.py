"""
SpiritLink RTT Bridge
Stasis Handler for Asterisk ARI integration
"""

import asyncio
import json
import os
from typing import Dict, Any, Optional, List

import aiohttp
import structlog

from rtt_handler import RTTHandler

logger = structlog.get_logger("spiritlink.stasis")

class StasisHandler:
    """
    Stasis Handler for Asterisk ARI integration
    """
    
    def __init__(self, rtt_handler: RTTHandler) -> None:
        """
        Initialize Stasis Handler
        
        Args:
            rtt_handler: RTT handler instance
        """
        self.rtt_handler = rtt_handler
        self.ari_url = os.getenv("ASTERISK_ARI_URL", "http://asterisk:8088/ari")
        self.ari_username = os.getenv("ASTERISK_ARI_USERNAME", "asterisk")
        self.ari_password = os.getenv("ASTERISK_ARI_PASSWORD", "asterisk")
        self.app_name = "rtt_bridge"
        self.websocket = None
        self.active_channels: Dict[str, Dict[str, Any]] = {}
        
        logger.info("Stasis Handler initialized")
    
    async def start(self) -> None:
        """Start the Stasis handler"""
        # Connect to Asterisk ARI WebSocket
        await self._connect_to_ari()
        
        logger.info("Stasis Handler started")
    
    async def stop(self) -> None:
        """Stop the Stasis handler"""
        if self.websocket:
            await self.websocket.close()
            self.websocket = None
        
        logger.info("Stasis Handler stopped")
    
    async def _connect_to_ari(self) -> None:
        """Connect to Asterisk ARI WebSocket"""
        try:
            # Create session
            session = aiohttp.ClientSession(auth=aiohttp.BasicAuth(self.ari_username, self.ari_password))
            
            # Connect to WebSocket first - this will create the application if it doesn't exist
            ws_url = f"{self.ari_url}/events?api_key={self.ari_username}:{self.ari_password}&app={self.app_name}"
            self.websocket = await session.ws_connect(ws_url)
            logger.info("Connected to Asterisk ARI WebSocket")
            
            # Start event loop
            asyncio.create_task(self._event_loop())
        except Exception as e:
            logger.error("Failed to connect to Asterisk ARI", error=str(e))
            raise
    
    async def _event_loop(self) -> None:
        """Event loop for processing ARI events"""
        if not self.websocket:
            logger.error("WebSocket not connected")
            return
        
        try:
            async for msg in self.websocket:
                if msg.type == aiohttp.WSMsgType.TEXT:
                    # Parse event
                    event = json.loads(msg.data)
                    
                    # Log all events for debugging
                    event_type = event.get("type")
                    logger.info(f"Received ARI event: {event_type}", event_data=str(event)[:200])
                    
                    # Process event
                    await self._process_event(event)
                elif msg.type == aiohttp.WSMsgType.CLOSED:
                    logger.warning("WebSocket closed")
                    break
                elif msg.type == aiohttp.WSMsgType.ERROR:
                    logger.error("WebSocket error", error=str(msg.data))
                    break
        except Exception as e:
            logger.error("Error in event loop", error=str(e))
        finally:
            # Reconnect
            await asyncio.sleep(5)
            await self._connect_to_ari()
    
    async def _process_event(self, event: Dict[str, Any]) -> None:
        """
        Process an ARI event
        
        Args:
            event: ARI event
        """
        event_type = event.get("type")
        
        logger.info(f"Processing ARI event: {event_type}", type=event_type)
        
        if event_type == "StasisStart":
            # New channel entered our application
            await self._handle_stasis_start(event)
        elif event_type == "StasisEnd":
            # Channel left our application
            await self._handle_stasis_end(event)
        elif event_type == "TextMessageReceived":
            # Text message received from channel
            logger.info(f"Processing TextMessageReceived event")
            
            # Log specific fields that should be present according to documentation
            if "message" in event:
                logger.info(f"Message field found")
                message_obj = event.get('message')
                if isinstance(message_obj, dict):
                    for key, value in message_obj.items():
                        logger.info(f"Message {key}: {value}")
            
            await self._handle_text_message(event)
    
    async def _handle_stasis_start(self, event: Dict[str, Any]) -> None:
        """
        Handle StasisStart event
        
        Args:
            event: ARI event
        """
        channel = event.get("channel", {})
        channel_id = channel.get("id")
        
        if not channel_id:
            logger.error("Invalid StasisStart event, missing channel ID")
            return
        
        logger.info("Channel entered application", channel_id=channel_id)
        
        try:
            # Store channel info
            self.active_channels[channel_id] = {
                "id": channel_id,
                "name": channel.get("name", "unknown"),
                "state": channel.get("state", "unknown"),
                "conversation_id": None
            }
            
            # Answer the channel
            try:
                answer_result = await self._ari_request("POST", f"/channels/{channel_id}/answer")
                logger.info(f"Channel answer result: {answer_result}", channel_id=channel_id)
            except Exception as e:
                logger.error(f"Error answering channel: {str(e)}", channel_id=channel_id)
            
            # Enable RTT on the channel
            try:
                rtt_result = await self._ari_request("POST", f"/channels/{channel_id}/variable", {
                    "variable": "RTT_ENABLED",
                    "value": "true"
                })
                logger.info(f"RTT enable result: {rtt_result}", channel_id=channel_id)
            except Exception as e:
                logger.error(f"Error enabling RTT: {str(e)}", channel_id=channel_id)
            
            # Start RTT session
            conversation_id = await self.rtt_handler.start_stasis_session(channel_id)
            
            if conversation_id:
                self.active_channels[channel_id]["conversation_id"] = conversation_id
                
                # Send welcome message via RTT
                welcome_message = "Hello! I'm an AI assistant. How can I help you today?"
                await self._send_text_to_channel(channel_id, welcome_message)
                
                # Try to explicitly enable RTT on the channel
                try:
                    logger.info(f"Explicitly enabling RTT on channel {channel_id}")
                    
                    # Set RTT variables
                    await self._ari_request("POST", f"/channels/{channel_id}/variable", {
                        "variable": "RTT_ENABLED",
                        "value": "true"
                    })
                    
                    await self._ari_request("POST", f"/channels/{channel_id}/variable", {
                        "variable": "RTTEXT_ENABLE",
                        "value": "true"
                    })
                    
                    await self._ari_request("POST", f"/channels/{channel_id}/variable", {
                        "variable": "RTTEXT_DETECT",
                        "value": "true"
                    })
                    
                    # Send a test RTT message to verify RTT is working
                    logger.info(f"Sending test RTT message to channel {channel_id}")
                    await self._ari_request("POST", f"/channels/{channel_id}/sendText", {
                        "text": "RTT is enabled. Please type your message.",
                        "x-rtt": "true"
                    })
                    
                    # Try to subscribe to TextMessageReceived events for this channel
                    logger.info(f"Subscribing to TextMessageReceived events for channel {channel_id}")
                    try:
                        await self._ari_request("POST", f"/applications/{self.app_name}/subscription", {
                            "eventSource": f"channel:{channel_id}:TextMessageReceived"
                        })
                        logger.info(f"Successfully subscribed to TextMessageReceived events for channel {channel_id}")
                    except Exception as e:
                        logger.error(f"Error subscribing to TextMessageReceived events: {str(e)}")
                    
                except Exception as e:
                    logger.error(f"Error enabling RTT: {str(e)}")
        except Exception as e:
            logger.error(f"Error handling StasisStart: {str(e)}", channel_id=channel_id)
    
    async def _handle_stasis_end(self, event: Dict[str, Any]) -> None:
        """
        Handle StasisEnd event
        
        Args:
            event: ARI event
        """
        channel = event.get("channel", {})
        channel_id = channel.get("id")
        
        if not channel_id:
            logger.error("Invalid StasisEnd event, missing channel ID")
            return
        
        logger.info("Channel left application", channel_id=channel_id)
        
        # End RTT session
        if channel_id in self.active_channels:
            conversation_id = self.active_channels[channel_id].get("conversation_id")
            
            if conversation_id:
                await self.rtt_handler.end_stasis_session(conversation_id)
            
            # Remove channel from active channels
            del self.active_channels[channel_id]
    
    async def _handle_text_message(self, event: Dict[str, Any]) -> None:
        """
        Handle TextMessageReceived event
        
        Args:
            event: ARI event
        """
        # Log the event type
        logger.info("Processing TextMessageReceived event in handler")
        
        try:
            # Get channel ID
            channel_id = event.get("channel", {}).get("id")
            if not channel_id:
                logger.error("Missing channel ID in TextMessageReceived event")
                return
                
            # Extract message text using a more robust approach
            message = None
            
            # Try to get message from message.body (per documentation)
            if "message" in event and isinstance(event["message"], dict):
                message_obj = event["message"]
                if "body" in message_obj:
                    message = message_obj["body"]
                    logger.info(f"Found message in message.body: '{message}'")
            
            # If not found, try other possible locations
            if not message and "message" in event and isinstance(event["message"], dict):
                if "text" in event["message"]:
                    message = event["message"]["text"]
                    logger.info(f"Found message in message.text: '{message}'")
            
            # Try direct event properties
            if not message and "text" in event:
                message = event["text"]
                logger.info(f"Found message in event.text: '{message}'")
                
            if not message and "body" in event:
                message = event["body"]
                logger.info(f"Found message in event.body: '{message}'")
            
            # Last resort - try to find any string property that might contain the message
            if not message:
                for key, value in event.items():
                    if isinstance(value, str) and len(value) > 0 and key not in ["type", "timestamp"]:
                        message = value
                        logger.info(f"Found potential message in event.{key}: '{message}'")
                        break
            
            if not message:
                logger.error("Could not find message text in TextMessageReceived event")
                return
            
            logger.info(f"Text message received: '{message}'", channel_id=channel_id)
        
            # Process message with RTT handler
            if channel_id in self.active_channels:
                logger.info(f"Channel {channel_id} is active")
                conversation_id = self.active_channels[channel_id].get("conversation_id")
                
                if conversation_id:
                    logger.info(f"Processing message for conversation {conversation_id}")
                    try:
                        await self.rtt_handler.process_stasis_message(
                            conversation_id,
                            message,
                            lambda text: self._send_text_to_channel(channel_id, text)
                        )
                        logger.info(f"Successfully processed message for conversation {conversation_id}")
                    except Exception as e:
                        logger.error(f"Error processing message: {str(e)}")
                else:
                    logger.error(f"No conversation ID for channel {channel_id}")
                    
                    # Try to create a new conversation for this channel
                    try:
                        logger.info(f"Attempting to create new conversation for channel {channel_id}")
                        conversation_id = await self.rtt_handler.start_stasis_session(channel_id)
                        if conversation_id:
                            self.active_channels[channel_id]["conversation_id"] = conversation_id
                            logger.info(f"Created new conversation {conversation_id} for channel {channel_id}")
                            
                            # Now process the message
                            await self.rtt_handler.process_stasis_message(
                                conversation_id,
                                message,
                                lambda text: self._send_text_to_channel(channel_id, text)
                            )
                    except Exception as e:
                        logger.error(f"Error creating new conversation: {str(e)}")
            else:
                logger.error(f"Channel {channel_id} not in active channels: {list(self.active_channels.keys())}")
                
                # Try to add the channel to active channels
                try:
                    logger.info(f"Attempting to add channel {channel_id} to active channels")
                    self.active_channels[channel_id] = {
                        "id": channel_id,
                        "name": "unknown",
                        "state": "unknown",
                        "conversation_id": None
                    }
                    
                    # Create a conversation for this channel
                    conversation_id = await self.rtt_handler.start_stasis_session(channel_id)
                    if conversation_id:
                        self.active_channels[channel_id]["conversation_id"] = conversation_id
                        logger.info(f"Created new conversation {conversation_id} for channel {channel_id}")
                        
                        # Now process the message
                        await self.rtt_handler.process_stasis_message(
                            conversation_id,
                            message,
                            lambda text: self._send_text_to_channel(channel_id, text)
                        )
                except Exception as e:
                    logger.error(f"Error adding channel to active channels: {str(e)}")
        except Exception as e:
            logger.error(f"Error handling TextMessageReceived event: {str(e)}")
    
    async def _send_text_to_channel(self, channel_id: str, text: str) -> None:
        """
        Send text to a channel
        
        Args:
            channel_id: Channel ID
            text: Text to send
        """
        try:
            result = await self._ari_request("POST", f"/channels/{channel_id}/sendText", {
                "text": text,
                "x-rtt": "true"
            })
            logger.debug(f"Send text result: {result}", channel_id=channel_id, text=text)
        except Exception as e:
            logger.error(f"Error sending text to channel: {str(e)}", channel_id=channel_id)
    
    async def _ari_request(self, method: str, path: str, data: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """
        Make an ARI request
        
        Args:
            method: HTTP method
            path: API path
            data: Request data
            
        Returns:
            Response data
        """
        url = f"{self.ari_url}{path}"
        
        async with aiohttp.ClientSession(auth=aiohttp.BasicAuth(self.ari_username, self.ari_password)) as session:
            try:
                if method == "GET":
                    async with session.get(url) as response:
                        if response.status == 204:  # No Content
                            return {}
                        content_type = response.headers.get('Content-Type', '')
                        if 'json' in content_type:
                            return await response.json()
                        else:
                            logger.warning(f"Non-JSON response from ARI: {await response.text()}")
                            return {"status": response.status}
                elif method == "POST":
                    async with session.post(url, json=data) as response:
                        if response.status == 204:  # No Content
                            return {}
                        content_type = response.headers.get('Content-Type', '')
                        if 'json' in content_type:
                            return await response.json()
                        else:
                            logger.warning(f"Non-JSON response from ARI: {await response.text()}")
                            return {"status": response.status}
                elif method == "DELETE":
                    async with session.delete(url) as response:
                        if response.status == 204:  # No Content
                            return {}
                        content_type = response.headers.get('Content-Type', '')
                        if 'json' in content_type:
                            return await response.json()
                        else:
                            logger.warning(f"Non-JSON response from ARI: {await response.text()}")
                            return {"status": response.status}
                else:
                    raise ValueError(f"Unsupported HTTP method: {method}")
            except Exception as e:
                logger.error(f"Error in ARI request: {str(e)}")
                return {"error": str(e)}
