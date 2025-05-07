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
            
            # First, ensure the application is registered
            try:
                # Check if application exists
                app_url = f"{self.ari_url}/applications/{self.app_name}"
                async with session.get(app_url) as response:
                    if response.status == 404:
                        # Application doesn't exist, create it
                        logger.info(f"Registering Stasis application: {self.app_name}")
                        create_url = f"{self.ari_url}/applications/{self.app_name}"
                        async with session.post(create_url, json={"name": self.app_name}) as create_response:
                            if create_response.status != 201:
                                logger.error(f"Failed to create application: {await create_response.text()}")
            except Exception as app_error:
                logger.error(f"Error checking/creating application: {str(app_error)}")
            
            # Subscribe to specific events
            try:
                # Subscribe to TextMessageReceived events
                logger.info("Subscribing to TextMessageReceived events")
                subscribe_url = f"{self.ari_url}/applications/{self.app_name}/subscription"
                event_source = "channel:TextMessageReceived"
                async with session.post(subscribe_url, json={"eventSource": event_source}) as subscribe_response:
                    if subscribe_response.status != 201:
                        logger.error(f"Failed to subscribe to events: {await subscribe_response.text()}")
                    else:
                        logger.info(f"Successfully subscribed to {event_source} events")
            except Exception as subscribe_error:
                logger.error(f"Error subscribing to events: {str(subscribe_error)}")
            
            # Connect to WebSocket
            ws_url = f"{self.ari_url}/events?api_key={self.ari_username}:{self.ari_password}&app={self.app_name}"
            self.websocket = await session.ws_connect(ws_url)
            
            # Start event loop
            asyncio.create_task(self._event_loop())
            
            logger.info("Connected to Asterisk ARI WebSocket")
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
                    logger.info(f"Received ARI event: {event_type}", event=str(event)[:200])
                    
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
            logger.info(f"Processing TextMessageReceived event: {event}")
            
            # Log specific fields that should be present according to documentation
            if "message" in event:
                logger.info(f"Message field: {event.get('message')}")
                if isinstance(event.get('message'), dict):
                    if "body" in event.get('message'):
                        logger.info(f"Message body: {event.get('message').get('body')}")
                    if "from" in event.get('message'):
                        logger.info(f"Message from: {event.get('message').get('from')}")
                    if "to" in event.get('message'):
                        logger.info(f"Message to: {event.get('message').get('to')}")
            
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
                
                # Send welcome message
                welcome_message = "Hello! I'm an AI assistant. How can I help you today?"
                await self._send_text_to_channel(channel_id, welcome_message)
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
        # Log the full event for debugging
        logger.info(f"TextMessageReceived event: {event}")
        
        channel_id = event.get("channel", {}).get("id")
        
        # Extract message text - check both possible locations based on documentation
        message_obj = event.get("message", {})
        message = message_obj.get("text") or message_obj.get("body")
        
        # Log the message object structure to help diagnose
        logger.info(f"Message object structure: {message_obj}")
        
        if not channel_id:
            logger.error(f"Invalid TextMessageReceived event - missing channel ID: {event}")
            return
            
        if not message:
            # Try to extract from other possible locations
            if "body" in event:
                message = event.get("body")
                logger.info(f"Found message in event.body: {message}")
            elif "text" in event:
                message = event.get("text")
                logger.info(f"Found message in event.text: {message}")
            else:
                logger.error(f"Invalid TextMessageReceived event - missing message text: {event}")
                return
        
        logger.info(f"Text message received: '{message}'", channel_id=channel_id, message=message)
        
        # Process message with RTT handler
        if channel_id in self.active_channels:
            logger.info(f"Channel {channel_id} is active")
            conversation_id = self.active_channels[channel_id].get("conversation_id")
            
            if conversation_id:
                logger.info(f"Processing message for conversation {conversation_id}")
                await self.rtt_handler.process_stasis_message(
                    conversation_id,
                    message,
                    lambda text: self._send_text_to_channel(channel_id, text)
                )
            else:
                logger.error(f"No conversation ID for channel {channel_id}")
        else:
            logger.error(f"Channel {channel_id} not in active channels: {list(self.active_channels.keys())}")
    
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
