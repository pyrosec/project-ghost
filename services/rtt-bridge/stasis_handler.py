"""
SpiritLink RTT Bridge
Stasis Handler for Asterisk ARI integration
"""

import asyncio
import json
import os
import traceback
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
        
        # Log all events for debugging
        logger.info(f"Processing ARI event: {event_type}")
        logger.info(f"Full event data: {json.dumps(event)[:1000]}")
        
        # Check for any RTT-related fields in the event
        rtt_related = False
        for key, value in event.items():
            if isinstance(value, str) and "rtt" in value.lower():
                logger.info(f"Found RTT-related field: {key}={value}")
                rtt_related = True
        
        if rtt_related:
            logger.info("This event appears to be RTT-related")
        
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
        elif "text" in event_type.lower() or "rtt" in event_type.lower() or "message" in event_type.lower():
            # This might be an RTT-related event that we're not explicitly handling
            logger.info(f"Potential RTT-related event: {event_type}")
            try:
                # Try to handle it as a text message
                await self._handle_text_message(event)
            except Exception as e:
                logger.error(f"Error handling potential RTT event: {str(e)}")
    
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
        # Log the full event for debugging
        logger.info(f"Processing text message event: {json.dumps(event)[:1000]}")
        
        try:
            # Extract message text using multiple approaches
            message = None
            channel_id = None
            
            # Approach 1: Standard TextMessageReceived format
            if "message" in event and isinstance(event["message"], dict) and "body" in event["message"]:
                message = event["message"]["body"]
                logger.info(f"Approach 1: Found message in message.body: '{message}'")
            
            # Approach 2: Check for text field in message
            if not message and "message" in event and isinstance(event["message"], dict) and "text" in event["message"]:
                message = event["message"]["text"]
                logger.info(f"Approach 2: Found message in message.text: '{message}'")
            
            # Approach 3: Check for direct text field
            if not message and "text" in event:
                message = event["text"]
                logger.info(f"Approach 3: Found message in event.text: '{message}'")
            
            # Approach 4: Check for RTT-specific fields
            if not message:
                for key, value in event.items():
                    if isinstance(key, str) and "rtt" in key.lower() and isinstance(value, str):
                        message = value
                        logger.info(f"Approach 4: Found message in RTT field {key}: '{message}'")
                        break
            
            # Approach 5: Look for any string field that might contain a message
            if not message:
                for key, value in event.items():
                    if isinstance(value, str) and len(value) > 0 and key not in ["type", "timestamp"]:
                        message = value
                        logger.info(f"Approach 5: Found potential message in field {key}: '{message}'")
                        break
            
            # Extract channel ID using multiple approaches
            
            # Approach 1: Direct channel field
            if "channel" in event and isinstance(event["channel"], dict) and "id" in event["channel"]:
                channel_id = event["channel"]["id"]
                logger.info(f"Found channel ID in channel.id: {channel_id}")
            
            # Approach 2: Check for endpoint and find associated channel
            elif "endpoint" in event and "resource" in event["endpoint"]:
                endpoint = event["endpoint"]["resource"]
                logger.info(f"Found endpoint: {endpoint}")
                
                # Look for a channel associated with this endpoint
                for active_channel_id, channel_data in self.active_channels.items():
                    # Use the first active channel for now
                    channel_id = active_channel_id
                    logger.info(f"Using channel {channel_id} for endpoint {endpoint}")
                    break
            
            # Approach 3: Use any active channel
            if not channel_id and self.active_channels:
                channel_id = next(iter(self.active_channels.keys()))
                logger.info(f"Using first active channel: {channel_id}")
            
            if not message:
                logger.error("Could not extract message from event")
                return
                
            if not channel_id:
                logger.error("Could not determine channel ID")
                return
                
            logger.info(f"Extracted message: '{message}' for channel: {channel_id}")
        
            # Process message with RTT handler
            if channel_id in self.active_channels:
                logger.info(f"Channel {channel_id} is active")
                conversation_id = self.active_channels[channel_id].get("conversation_id")
                
                if conversation_id:
                    logger.info(f"Processing message for conversation {conversation_id}")
                    try:
                        # Use a callback that sends messages directly to the channel
                        async def send_response(text):
                            # Send response back to the channel
                            await self._send_text_to_channel(channel_id, text)
                            logger.info(f"Sent response to channel {channel_id}: {text}")
                        
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
                                await self._send_text_to_channel(channel_id, text)
                                logger.info(f"Sent response to channel {channel_id}: {text}")
                            
                            await self.rtt_handler.process_stasis_message(
                                conversation_id,
                                message,
                                send_response
                            )
                    except Exception as e:
                        logger.error(f"Error creating new conversation: {str(e)}")
            else:
                logger.info(f"Channel {channel_id} not in active channels, adding it")
                
                # Add to active channels
                self.active_channels[channel_id] = {
                    "id": channel_id,
                    "name": f"channel-{channel_id}",
                    "state": "unknown",
                    "conversation_id": None
                }
                
                # Create a conversation for this channel
                try:
                    conversation_id = await self.rtt_handler.start_stasis_session(channel_id)
                    if conversation_id:
                        self.active_channels[channel_id]["conversation_id"] = conversation_id
                        logger.info(f"Created new conversation {conversation_id} for channel {channel_id}")
                        
                        # Process the message
                        async def send_response(text):
                            await self._send_text_to_channel(channel_id, text)
                            logger.info(f"Sent response to channel {channel_id}: {text}")
                        
                        await self.rtt_handler.process_stasis_message(
                            conversation_id,
                            message,
                            send_response
                        )
                except Exception as e:
                    logger.error(f"Error creating conversation for new channel: {str(e)}")
        except Exception as e:
            logger.error(f"Error handling text message event: {str(e)}")
            logger.error(f"Exception details: {traceback.format_exc()}")
    
    async def _send_text_to_channel(self, channel_id: str, text: str) -> None:
        """
        Send text to a channel
        
        Args:
            channel_id: Channel ID
            text: Text to send
        """
        logger.info(f"Attempting to send text to channel {channel_id}: '{text}'")
        
        # Try multiple methods to send RTT text
        success = False
        
        # Method 1: Direct channel sendText with RTT flag
        try:
            logger.info(f"Method 1: Using channel sendText with RTT flag")
            result = await self._ari_request("POST", f"/channels/{channel_id}/sendText", {
                "text": text,
                "x-rtt": "true"
            })
            logger.info(f"Method 1 result: {result}")
            success = True
        except Exception as e:
            logger.error(f"Method 1 failed: {str(e)}")
        
        # Method 2: Direct channel sendText without RTT flag
        if not success:
            try:
                logger.info(f"Method 2: Using channel sendText without RTT flag")
                result = await self._ari_request("POST", f"/channels/{channel_id}/sendText", {
                    "text": text
                })
                logger.info(f"Method 2 result: {result}")
                success = True
            except Exception as e:
                logger.error(f"Method 2 failed: {str(e)}")
        
        # Method 3: Using channel variable
        if not success:
            try:
                logger.info(f"Method 3: Using channel variable")
                result = await self._ari_request("POST", f"/channels/{channel_id}/variable", {
                    "variable": "RTTEXT_MESSAGE",
                    "value": text
                })
                logger.info(f"Method 3 result: {result}")
                success = True
            except Exception as e:
                logger.error(f"Method 3 failed: {str(e)}")
        
        # Method 4: Using playback with speech
        if not success:
            try:
                logger.info(f"Method 4: Using playback with speech")
                result = await self._ari_request("POST", f"/channels/{channel_id}/play", {
                    "media": f"sound:say:{text}"
                })
                logger.info(f"Method 4 result: {result}")
                success = True
            except Exception as e:
                logger.error(f"Method 4 failed: {str(e)}")
        
        if not success:
            logger.error(f"All methods failed to send text to channel {channel_id}")
    
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
