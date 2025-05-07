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
            # Text message received - handle according to RTT guide
            logger.info("Received TextMessageReceived event")
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
                    
                    # Subscribe to endpoint events as per the RTT guide
                    logger.info("Subscribing to endpoint events for RTT")
                    try:
                        await self._ari_request("POST", f"/applications/{self.app_name}/subscription", {
                            "eventSource": "endpoint:"
                        })
                        logger.info("Successfully subscribed to endpoint events")
                    except Exception as e:
                        logger.error(f"Error subscribing to endpoint events: {str(e)}")
                    
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
        # Log the event
        logger.info(f"Processing TextMessageReceived event: {event}")
        
        try:
            # According to the RTT guide, TextMessageReceived events have this structure:
            # - endpoint: The endpoint that sent the message
            # - message: The text content of the message
            # - technology: The technology of the endpoint (SIP, PJSIP, etc.)
            
            # Extract the message body
            if "message" in event and isinstance(event["message"], dict) and "body" in event["message"]:
                message = event["message"]["body"]
                logger.info(f"Received RTT message: '{message}'")
            else:
                logger.error("Invalid TextMessageReceived event format")
                return
            
            # Get the endpoint
            if "endpoint" in event and "resource" in event["endpoint"]:
                endpoint = event["endpoint"]["resource"]
                logger.info(f"Message from endpoint: {endpoint}")
            else:
                logger.error("Missing endpoint in TextMessageReceived event")
                return
            
            # Find the channel associated with this endpoint
            # This is a simplification - in a real implementation, you'd need to track
            # which channels are associated with which endpoints
            channel_id = None
            for active_channel_id, channel_data in self.active_channels.items():
                # For now, just use the first active channel
                channel_id = active_channel_id
                break
            
            if not channel_id:
                logger.error("No active channels found for endpoint")
                return
                
            logger.info(f"Using channel {channel_id} for endpoint {endpoint}")
        
            # Process message with RTT handler
            if channel_id in self.active_channels:
                logger.info(f"Channel {channel_id} is active")
                conversation_id = self.active_channels[channel_id].get("conversation_id")
                
                if conversation_id:
                    logger.info(f"Processing message for conversation {conversation_id}")
                    try:
                        # Use a callback that sends messages to the endpoint
                        async def send_response(text):
                            # Send response back to the endpoint that sent the message
                            await self._ari_request("PUT", "/endpoints/sendMessage", {
                                "to": endpoint,
                                "from": "sip:rtt-bridge@localhost",
                                "body": text
                            })
                            logger.info(f"Sent response to endpoint {endpoint}: {text}")
                        
                        # Process the message
                        await self.rtt_handler.process_stasis_message(
                            conversation_id,
                            message,
                            send_response
                        )
                        logger.info(f"Successfully processed message for conversation {conversation_id}")
                    except Exception as e:
                        logger.error(f"Error processing message: {str(e)}")
                else:
                    logger.info(f"No conversation ID for channel {channel_id}, creating new conversation")
                    
                    # Create a new conversation for this channel
                    try:
                        conversation_id = await self.rtt_handler.start_stasis_session(channel_id)
                        if conversation_id:
                            self.active_channels[channel_id]["conversation_id"] = conversation_id
                            logger.info(f"Created new conversation {conversation_id} for channel {channel_id}")
                            
                            # Process the message with the new conversation
                            async def send_response(text):
                                await self._ari_request("PUT", "/endpoints/sendMessage", {
                                    "to": endpoint,
                                    "from": "sip:rtt-bridge@localhost",
                                    "body": text
                                })
                                logger.info(f"Sent response to endpoint {endpoint}: {text}")
                            
                            await self.rtt_handler.process_stasis_message(
                                conversation_id,
                                message,
                                send_response
                            )
                    except Exception as e:
                        logger.error(f"Error creating new conversation: {str(e)}")
            else:
                logger.info(f"No active channel found for endpoint {endpoint}, creating new channel entry")
                
                # Create a new channel entry
                try:
                    # Try to get channel info for this endpoint
                    channels = await self._ari_request("GET", "/channels")
                    
                    # Find a channel associated with this endpoint
                    found_channel_id = None
                    for channel in channels:
                        if "endpoint" in channel and channel["endpoint"] == endpoint:
                            found_channel_id = channel["id"]
                            break
                    
                    if found_channel_id:
                        channel_id = found_channel_id
                        logger.info(f"Found channel {channel_id} for endpoint {endpoint}")
                    else:
                        # Generate a placeholder channel ID
                        channel_id = f"endpoint-{endpoint.replace(':', '-')}"
                        logger.info(f"Created placeholder channel {channel_id} for endpoint {endpoint}")
                    
                    # Add to active channels
                    self.active_channels[channel_id] = {
                        "id": channel_id,
                        "name": endpoint,
                        "state": "unknown",
                        "endpoint": endpoint,
                        "conversation_id": None
                    }
                    
                    # Create a conversation for this channel
                    conversation_id = await self.rtt_handler.start_stasis_session(channel_id)
                    if conversation_id:
                        self.active_channels[channel_id]["conversation_id"] = conversation_id
                        logger.info(f"Created new conversation {conversation_id} for channel {channel_id}")
                        
                        # Process the message
                        async def send_response(text):
                            await self._ari_request("PUT", "/endpoints/sendMessage", {
                                "to": endpoint,
                                "from": "sip:rtt-bridge@localhost",
                                "body": text
                            })
                            logger.info(f"Sent response to endpoint {endpoint}: {text}")
                        
                        await self.rtt_handler.process_stasis_message(
                            conversation_id,
                            message,
                            send_response
                        )
                except Exception as e:
                    logger.error(f"Error handling endpoint {endpoint}: {str(e)}")
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
            # Get the endpoint associated with this channel
            channel_info = await self._ari_request("GET", f"/channels/{channel_id}")
            
            if "endpoint" in channel_info:
                endpoint = channel_info["endpoint"]
                logger.info(f"Found endpoint {endpoint} for channel {channel_id}")
                
                # Send message using the endpoints/sendMessage endpoint as per the RTT guide
                result = await self._ari_request("PUT", "/endpoints/sendMessage", {
                    "to": endpoint,
                    "from": "sip:rtt-bridge@localhost",
                    "body": text
                })
                logger.info(f"Send text result: {result}", endpoint=endpoint, text=text)
            else:
                # Fallback to channel sendText if endpoint not found
                logger.warning(f"No endpoint found for channel {channel_id}, falling back to sendText")
                result = await self._ari_request("POST", f"/channels/{channel_id}/sendText", {
                    "text": text,
                    "x-rtt": "true"
                })
                logger.info(f"Fallback send text result: {result}", channel_id=channel_id, text=text)
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
