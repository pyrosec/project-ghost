"""
GhoulBridge - DTMF Handling Bridge for Asterisk
Stasis Handler for Asterisk ARI integration
"""

import asyncio
import json
import os
import traceback
from typing import Dict, Any, Optional, List

import aiohttp
import structlog

from dtmf_handler import DTMFHandler

logger = structlog.get_logger("ghoulbridge.stasis")

class StasisHandler:
    """
    Stasis Handler for Asterisk ARI integration
    """
    
    def __init__(self, dtmf_handler: DTMFHandler) -> None:
        """
        Initialize Stasis Handler
        
        Args:
            dtmf_handler: DTMF handler instance
        """
        self.dtmf_handler = dtmf_handler
        self.ari_url = os.getenv("ASTERISK_ARI_URL", "http://asterisk:8088/ari")
        self.ari_username = os.getenv("ASTERISK_ARI_USERNAME", "asterisk")
        self.ari_password = os.getenv("ASTERISK_ARI_PASSWORD", "asterisk")
        self.app_name = "ghoulbridge"
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
        logger.debug(f"Full event data: {json.dumps(event)[:1000]}")
        
        if event_type == "StasisStart":
            # New channel entered our application
            await self._handle_stasis_start(event)
        elif event_type == "StasisEnd":
            # Channel left our application
            await self._handle_stasis_end(event)
        elif event_type == "ChannelDtmfReceived":
            # DTMF received - this is the main event we're interested in
            await self._handle_dtmf_received(event)
        elif event_type == "ChannelHold":
            # Channel put on hold
            await self._handle_channel_hold(event)
        elif event_type == "ChannelUnhold":
            # Channel taken off hold
            await self._handle_channel_unhold(event)
    
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
            
            # Start DTMF session
            conversation_id = await self.dtmf_handler.start_stasis_session(channel_id)
            
            if conversation_id:
                self.active_channels[channel_id]["conversation_id"] = conversation_id
                
                # Send welcome message
                await self._send_text_to_channel(channel_id, "DTMF handler connected. Ready to process DTMF sequences.")
                
                # Set DTMF variables
                try:
                    # Set DTMF timeout
                    await self._ari_request("POST", f"/channels/{channel_id}/variable", {
                        "variable": "TIMEOUT(digit)",
                        "value": "3"  # 3 seconds
                    })
                    
                    await self._ari_request("POST", f"/channels/{channel_id}/variable", {
                        "variable": "TIMEOUT(response)",
                        "value": "10"  # 10 seconds
                    })
                    
                    # Enable DTMF detection
                    await self._ari_request("POST", f"/channels/{channel_id}/variable", {
                        "variable": "DTMF_FEATURES",
                        "value": "H"
                    })
                    
                    # Set feature map context
                    await self._ari_request("POST", f"/channels/{channel_id}/variable", {
                        "variable": "FEATUREMAP_CONTEXT",
                        "value": "featuremap_context"
                    })
                    
                    # Set feature map digit
                    await self._ari_request("POST", f"/channels/{channel_id}/variable", {
                        "variable": "FEATUREMAP_DIGIT",
                        "value": "*"
                    })
                    
                    # Set feature digit timeout
                    await self._ari_request("POST", f"/channels/{channel_id}/variable", {
                        "variable": "FEATURE_DIGIT_TIMEOUT",
                        "value": "3000"  # 3 seconds
                    })
                    
                    # Set dynamic features
                    await self._ari_request("POST", f"/channels/{channel_id}/variable", {
                        "variable": "DYNAMIC_FEATURES",
                        "value": "all"
                    })
                    
                except Exception as e:
                    logger.error(f"Error setting DTMF variables: {str(e)}", channel_id=channel_id)
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
        
        # End DTMF session
        if channel_id in self.active_channels:
            conversation_id = self.active_channels[channel_id].get("conversation_id")
            
            if conversation_id:
                await self.dtmf_handler.end_stasis_session(conversation_id)
            
            # Remove channel from active channels
            del self.active_channels[channel_id]
    
    async def _handle_dtmf_received(self, event: Dict[str, Any]) -> None:
        """
        Handle ChannelDtmfReceived event
        
        Args:
            event: ARI event
        """
        channel = event.get("channel", {})
        channel_id = channel.get("id")
        digit = event.get("digit")
        
        if not channel_id or not digit:
            logger.error("Invalid ChannelDtmfReceived event, missing channel ID or digit")
            return
        
        logger.info("DTMF digit received", channel_id=channel_id, digit=digit)
        
        # Process DTMF digit
        if channel_id in self.active_channels:
            conversation_id = self.active_channels[channel_id].get("conversation_id")
            
            if conversation_id:
                # Process the DTMF digit
                async def send_response(text):
                    # Send response back to the channel
                    await self._send_text_to_channel(channel_id, text)
                    logger.info(f"Sent response to channel {channel_id}: {text}")
                
                result = await self.dtmf_handler.process_stasis_dtmf(
                    conversation_id,
                    digit,
                    send_response
                )
                
                if result:
                    logger.info("DTMF sequence processed successfully", channel_id=channel_id)
                    
                    # Get the last action from the session
                    session = self.dtmf_handler.stasis_sessions.get(conversation_id)
                    if session:
                        last_action = session.get("last_action")
                        
                        # Execute the action
                        if last_action == "disa":
                            await self._execute_disa(channel_id)
                        elif last_action == "bridge_held_call":
                            await self._execute_bridge_held_call(channel_id)
                        elif last_action == "park_call":
                            park_id = session.get("park_id")
                            await self._execute_park_call(channel_id, park_id)
                        elif last_action == "retrieve_parked_call":
                            park_id = session.get("park_id")
                            await self._execute_retrieve_parked_call(channel_id, park_id)
    
    async def _handle_channel_hold(self, event: Dict[str, Any]) -> None:
        """
        Handle ChannelHold event
        
        Args:
            event: ARI event
        """
        channel = event.get("channel", {})
        channel_id = channel.get("id")
        
        if not channel_id:
            logger.error("Invalid ChannelHold event, missing channel ID")
            return
        
        logger.info("Channel put on hold", channel_id=channel_id)
        
        # Update channel state
        if channel_id in self.active_channels:
            self.active_channels[channel_id]["state"] = "hold"
    
    async def _handle_channel_unhold(self, event: Dict[str, Any]) -> None:
        """
        Handle ChannelUnhold event
        
        Args:
            event: ARI event
        """
        channel = event.get("channel", {})
        channel_id = channel.get("id")
        
        if not channel_id:
            logger.error("Invalid ChannelUnhold event, missing channel ID")
            return
        
        logger.info("Channel taken off hold", channel_id=channel_id)
        
        # Update channel state
        if channel_id in self.active_channels:
            self.active_channels[channel_id]["state"] = "up"
    
    async def _execute_disa(self, channel_id: str) -> None:
        """
        Execute DISA action
        
        Args:
            channel_id: Channel ID
        """
        logger.info("Executing DISA action", channel_id=channel_id)
        
        try:
            # Set channel variable to indicate DISA mode
            await self._ari_request("POST", f"/channels/{channel_id}/variable", {
                "variable": "IN_DISA",
                "value": "true"
            })
            
            # Execute DISA application
            await self._ari_request("POST", f"/channels/{channel_id}/redirect", {
                "context": "disa_context",
                "extension": "s",
                "priority": 1
            })
        except Exception as e:
            logger.error(f"Error executing DISA: {str(e)}", channel_id=channel_id)
    
    async def _execute_bridge_held_call(self, channel_id: str) -> None:
        """
        Execute bridge held call action
        
        Args:
            channel_id: Channel ID
        """
        logger.info("Executing bridge held call action", channel_id=channel_id)
        
        try:
            # Get the held channel ID from the channel variable
            held_channel_id = await self._ari_request("GET", f"/channels/{channel_id}/variable", {
                "variable": "HELD_CHANNEL_ID"
            })
            
            if not held_channel_id:
                logger.error("No held channel ID found", channel_id=channel_id)
                return
            
            # Create a bridge
            bridge_result = await self._ari_request("POST", "/bridges", {
                "type": "mixing",
                "name": f"bridge-{channel_id}-{held_channel_id}"
            })
            
            bridge_id = bridge_result.get("id")
            if not bridge_id:
                logger.error("Failed to create bridge", channel_id=channel_id)
                return
            
            # Add channels to the bridge
            await self._ari_request("POST", f"/bridges/{bridge_id}/addChannel", {
                "channel": channel_id
            })
            
            await self._ari_request("POST", f"/bridges/{bridge_id}/addChannel", {
                "channel": held_channel_id
            })
            
            logger.info("Channels bridged successfully", channel_id=channel_id, held_channel_id=held_channel_id)
        except Exception as e:
            logger.error(f"Error bridging held call: {str(e)}", channel_id=channel_id)
    
    async def _execute_park_call(self, channel_id: str, park_id: str) -> None:
        """
        Execute park call action
        
        Args:
            channel_id: Channel ID
            park_id: Park ID
        """
        logger.info("Executing park call action", channel_id=channel_id, park_id=park_id)
        
        try:
            # Store the channel ID in Redis with the park ID as the key
            redis_url = os.getenv("REDIS_URI", "redis://redis:6379")
            import redis.asyncio as redis
            
            redis_client = redis.from_url(redis_url)
            await redis_client.set(f"parked_call:{park_id}", channel_id, ex=3600)  # Expire after 1 hour
            
            # Set channel variable to indicate parked status
            await self._ari_request("POST", f"/channels/{channel_id}/variable", {
                "variable": "PARKED",
                "value": "true"
            })
            
            # Set channel variable with park ID
            await self._ari_request("POST", f"/channels/{channel_id}/variable", {
                "variable": "PARK_ID",
                "value": park_id
            })
            
            # Play announcement
            await self._ari_request("POST", f"/channels/{channel_id}/play", {
                "media": "sound:call-parked"
            })
            
            logger.info("Call parked successfully", channel_id=channel_id, park_id=park_id)
        except Exception as e:
            logger.error(f"Error parking call: {str(e)}", channel_id=channel_id)
    
    async def _execute_retrieve_parked_call(self, channel_id: str, park_id: str) -> None:
        """
        Execute retrieve parked call action
        
        Args:
            channel_id: Channel ID
            park_id: Park ID
        """
        logger.info("Executing retrieve parked call action", channel_id=channel_id, park_id=park_id)
        
        try:
            # Get the parked channel ID from Redis
            redis_url = os.getenv("REDIS_URI", "redis://redis:6379")
            import redis.asyncio as redis
            
            redis_client = redis.from_url(redis_url)
            parked_channel_id = await redis_client.get(f"parked_call:{park_id}")
            
            if not parked_channel_id:
                logger.error("No parked call found with the given ID", channel_id=channel_id, park_id=park_id)
                
                # Play announcement
                await self._ari_request("POST", f"/channels/{channel_id}/play", {
                    "media": "sound:invalid"
                })
                return
            
            # Convert bytes to string
            parked_channel_id = parked_channel_id.decode("utf-8")
            
            # Create a bridge
            bridge_result = await self._ari_request("POST", "/bridges", {
                "type": "mixing",
                "name": f"bridge-{channel_id}-{parked_channel_id}"
            })
            
            bridge_id = bridge_result.get("id")
            if not bridge_id:
                logger.error("Failed to create bridge", channel_id=channel_id)
                return
            
            # Add channels to the bridge
            await self._ari_request("POST", f"/bridges/{bridge_id}/addChannel", {
                "channel": channel_id
            })
            
            await self._ari_request("POST", f"/bridges/{bridge_id}/addChannel", {
                "channel": parked_channel_id
            })
            
            # Remove the parked call from Redis
            await redis_client.delete(f"parked_call:{park_id}")
            
            logger.info("Parked call retrieved successfully", channel_id=channel_id, parked_channel_id=parked_channel_id)
        except Exception as e:
            logger.error(f"Error retrieving parked call: {str(e)}", channel_id=channel_id)
    
    async def _send_text_to_channel(self, channel_id: str, text: str) -> None:
        """
        Send text to a channel
        
        Args:
            channel_id: Channel ID
            text: Text to send
        """
        logger.info(f"Sending text to channel {channel_id}: '{text}'")
        
        try:
            result = await self._ari_request("POST", f"/channels/{channel_id}/sendText", {
                "text": text
            })
            logger.info(f"Send text result: {result}")
        except Exception as e:
            logger.error(f"Error sending text: {str(e)}", channel_id=channel_id)
    
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
                    params = data if data else None
                    async with session.get(url, params=params) as response:
                        if response.status >= 400:
                            error_text = await response.text()
                            logger.error(f"ARI request failed: {response.status} {error_text}")
                            return {}
                        return await response.json()
                elif method == "POST":
                    async with session.post(url, json=data) as response:
                        if response.status >= 400:
                            error_text = await response.text()
                            logger.error(f"ARI request failed: {response.status} {error_text}")
                            return {}
                        if response.status == 204:  # No content
                            return {}
                        return await response.json()
                elif method == "DELETE":
                    async with session.delete(url) as response:
                        if response.status >= 400:
                            error_text = await response.text()
                            logger.error(f"ARI request failed: {response.status} {error_text}")
                            return {}
                        if response.status == 204:  # No content
                            return {}
                        return await response.json()
                else:
                    logger.error(f"Unsupported HTTP method: {method}")
                    return {}
            except Exception as e:
                logger.error(f"ARI request error: {str(e)}")
                return {}