"""
GhoulBridge - DTMF Handling Bridge for Asterisk
DTMF Handler for managing DTMF sequences
"""

import asyncio
import json
import uuid
from typing import Dict, Any, Optional, Callable, List

import structlog
from fastapi import WebSocket

logger = structlog.get_logger("ghoulbridge.dtmf")

class DTMFHandler:
    """
    Handler for DTMF communication between Asterisk and clients
    """
    
    def __init__(self) -> None:
        """Initialize DTMF Handler"""
        self.active_sessions: Dict[str, Dict[str, Any]] = {}
        self.stasis_sessions: Dict[str, Dict[str, Any]] = {}
        
        # Define DTMF sequence patterns and their handlers
        self.dtmf_patterns = {
            # *1# - Put call on hold and enter DISA
            r"^\*1#$": self._handle_disa_sequence,
            
            # *# - Bridge the DISA call with the original held call
            r"^\*#$": self._handle_bridge_held_call,
            
            # *0xxx# - Park the call with identifier xxx (requires at least one digit)
            r"^\*0\d+#$": self._handle_park_call,
            
            # *0xxx - Retrieve parked call with identifier xxx (requires at least two digits)
            r"^\*0\d\d+$": self._handle_retrieve_parked_call,
            
            # Partial patterns for collecting more digits
            r"^\*0\d*$": None,  # Partial park/retrieve pattern
            r"^\*1$": None,      # Partial DISA pattern
        }
        
        logger.info("DTMF Handler initialized")
    
    async def handle_websocket(self, websocket: WebSocket) -> None:
        """
        Handle WebSocket connection for DTMF communication
        
        Args:
            websocket: WebSocket connection
        """
        # Generate conversation ID
        conversation_id = str(uuid.uuid4())
        
        # Create session context
        self.active_sessions[conversation_id] = {
            "channel_id": f"websocket-{conversation_id}",
            "buffer": "",
            "last_sequence": "",
        }
        
        logger.info(
            "WebSocket DTMF session started",
            conversation_id=conversation_id
        )
        
        try:
            # Send welcome message
            welcome_message = {
                "type": "message",
                "content": "DTMF Handler connected. Ready to process DTMF sequences."
            }
            await websocket.send_text(json.dumps(welcome_message))
            
            # Main communication loop
            while True:
                # Receive message from WebSocket
                try:
                    message = await websocket.receive_text()
                    data = json.loads(message)
                    
                    if "dtmf" in data:
                        dtmf_sequence = data["dtmf"]
                        
                        logger.debug(
                            "Received DTMF sequence from WebSocket",
                            dtmf_sequence=dtmf_sequence,
                            conversation_id=conversation_id
                        )
                        
                        # Process the DTMF sequence
                        result = await self._process_dtmf_sequence(
                            conversation_id,
                            dtmf_sequence,
                            lambda response: websocket.send_text(json.dumps({
                                "type": "response",
                                "content": response
                            }))
                        )
                        
                        # Send result
                        await websocket.send_text(json.dumps({
                            "type": "result",
                            "success": result is not None,
                            "message": "DTMF sequence processed" if result else "Unknown DTMF sequence"
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
                "WebSocket DTMF session ended",
                conversation_id=conversation_id
            )
    
    async def start_stasis_session(self, channel_id: str) -> str:
        """
        Start a new Stasis session for a channel
        
        Args:
            channel_id: Asterisk channel ID
            
        Returns:
            Conversation ID
        """
        # Generate conversation ID
        conversation_id = str(uuid.uuid4())
        
        # Create session context
        self.stasis_sessions[conversation_id] = {
            "channel_id": channel_id,
            "buffer": "",
            "last_sequence": "",
            "dtmf_timeout": 3000,  # 3 seconds timeout for DTMF sequences
            "partial_sequence": "",
            "sequence_start_time": None
        }
        
        logger.info(
            "Stasis DTMF session started",
            conversation_id=conversation_id,
            channel_id=channel_id
        )
        
        return conversation_id
    
    async def end_stasis_session(self, conversation_id: str) -> None:
        """
        End a Stasis session
        
        Args:
            conversation_id: Conversation ID
        """
        if conversation_id in self.stasis_sessions:
            channel_id = self.stasis_sessions[conversation_id]["channel_id"]
            del self.stasis_sessions[conversation_id]
            
            logger.info(
                "Stasis DTMF session ended",
                conversation_id=conversation_id,
                channel_id=channel_id
            )
    
    async def process_stasis_dtmf(
        self,
        conversation_id: str,
        dtmf_digit: str,
        send_callback: Callable[[str], Any]
    ) -> bool:
        """
        Process a DTMF digit from a Stasis session
        
        Args:
            conversation_id: Conversation ID
            dtmf_digit: DTMF digit to process
            send_callback: Callback function to send responses
            
        Returns:
            True if the DTMF sequence was processed, False otherwise
        """
        try:
            if conversation_id not in self.stasis_sessions:
                logger.error(
                    "Invalid conversation ID",
                    conversation_id=conversation_id
                )
                return False
            
            logger.info(
                "Processing Stasis DTMF digit",
                dtmf_digit=dtmf_digit,
                conversation_id=conversation_id
            )
            
            # Get session context
            session = self.stasis_sessions[conversation_id]
            
            # Add digit to partial sequence
            session["partial_sequence"] += dtmf_digit
            
            # Update sequence start time if this is the first digit
            if not session["sequence_start_time"]:
                session["sequence_start_time"] = asyncio.get_event_loop().time()
            
            # Check if we have a complete sequence
            partial_sequence = session["partial_sequence"]
            result = await self._process_dtmf_sequence(conversation_id, partial_sequence, send_callback)
            
            if result:
                # Complete sequence processed, reset partial sequence
                session["partial_sequence"] = ""
                session["sequence_start_time"] = None
                return True
            
            # Check for timeout
            current_time = asyncio.get_event_loop().time()
            if session["sequence_start_time"] and (current_time - session["sequence_start_time"]) * 1000 > session["dtmf_timeout"]:
                # Timeout occurred, reset partial sequence
                logger.info(
                    "DTMF sequence timeout",
                    partial_sequence=partial_sequence,
                    conversation_id=conversation_id
                )
                session["partial_sequence"] = ""
                session["sequence_start_time"] = None
                
                # Send timeout message
                await send_callback(f"DTMF sequence timeout: {partial_sequence}")
                return False
            
            return False
            
        except Exception as e:
            logger.error(f"Error in process_stasis_dtmf: {str(e)}", conversation_id=conversation_id)
            return False
    
    async def _process_dtmf_sequence(
        self,
        conversation_id: str,
        dtmf_sequence: str,
        send_callback: Callable[[str], Any]
    ) -> Optional[bool]:
        """
        Process a DTMF sequence
        
        Args:
            conversation_id: Conversation ID
            dtmf_sequence: DTMF sequence to process
            send_callback: Callback function to send responses
            
        Returns:
            True if the DTMF sequence was processed, False otherwise
        """
        logger.info(
            "Processing DTMF sequence",
            dtmf_sequence=dtmf_sequence,
            conversation_id=conversation_id
        )
        
        # Check for complete patterns
        import re
        for pattern, handler in self.dtmf_patterns.items():
            if re.match(pattern, dtmf_sequence):
                if handler:
                    # Complete pattern with handler
                    try:
                        result = await handler(conversation_id, dtmf_sequence, send_callback)
                        return result
                    except Exception as e:
                        logger.error(f"Error handling DTMF sequence: {str(e)}")
                        await send_callback(f"Error processing DTMF sequence: {str(e)}")
                        return False
                else:
                    # Partial pattern, waiting for more digits
                    logger.info(
                        "Partial DTMF sequence detected",
                        dtmf_sequence=dtmf_sequence,
                        conversation_id=conversation_id
                    )
                    await send_callback(f"Partial DTMF sequence: {dtmf_sequence}, waiting for more digits...")
                    return None
        
        # Unknown sequence
        logger.info(
            "Unknown DTMF sequence",
            dtmf_sequence=dtmf_sequence,
            conversation_id=conversation_id
        )
        await send_callback(f"Unknown DTMF sequence: {dtmf_sequence}")
        return False
    
    async def _handle_disa_sequence(
        self,
        conversation_id: str,
        dtmf_sequence: str,
        send_callback: Callable[[str], Any]
    ) -> bool:
        """
        Handle DISA sequence (*1#)
        
        Args:
            conversation_id: Conversation ID
            dtmf_sequence: DTMF sequence
            send_callback: Callback function to send responses
            
        Returns:
            True if successful
        """
        logger.info(
            "Handling DISA sequence",
            conversation_id=conversation_id
        )
        
        await send_callback("Entering DISA mode")
        
        # Store the action in the session
        session = self.stasis_sessions.get(conversation_id) or self.active_sessions.get(conversation_id)
        if session:
            session["last_action"] = "disa"
            session["in_disa"] = True
        
        return True
    
    async def _handle_bridge_held_call(
        self,
        conversation_id: str,
        dtmf_sequence: str,
        send_callback: Callable[[str], Any]
    ) -> bool:
        """
        Handle bridge held call sequence (*#)
        
        Args:
            conversation_id: Conversation ID
            dtmf_sequence: DTMF sequence
            send_callback: Callback function to send responses
            
        Returns:
            True if successful
        """
        logger.info(
            "Handling bridge held call sequence",
            conversation_id=conversation_id
        )
        
        # Check if in DISA mode
        session = self.stasis_sessions.get(conversation_id) or self.active_sessions.get(conversation_id)
        if not session or not session.get("in_disa"):
            await send_callback("Not in DISA mode, cannot bridge held call")
            return False
        
        await send_callback("Bridging with held call")
        
        # Store the action in the session
        if session:
            session["last_action"] = "bridge_held_call"
        
        return True
    
    async def _handle_park_call(
        self,
        conversation_id: str,
        dtmf_sequence: str,
        send_callback: Callable[[str], Any]
    ) -> bool:
        """
        Handle park call sequence (*0xxx#)
        
        Args:
            conversation_id: Conversation ID
            dtmf_sequence: DTMF sequence
            send_callback: Callback function to send responses
            
        Returns:
            True if successful
        """
        # Extract park ID
        import re
        match = re.match(r"^\*0(\d+)#$", dtmf_sequence)
        if not match:
            await send_callback(f"Invalid park call sequence: {dtmf_sequence}")
            return False
        
        park_id = match.group(1)
        
        logger.info(
            "Handling park call sequence",
            conversation_id=conversation_id,
            park_id=park_id
        )
        
        await send_callback(f"Parking call with ID: {park_id}")
        
        # Store the action in the session
        session = self.stasis_sessions.get(conversation_id) or self.active_sessions.get(conversation_id)
        if session:
            session["last_action"] = "park_call"
            session["park_id"] = park_id
        
        return True
    
    async def _handle_retrieve_parked_call(
        self,
        conversation_id: str,
        dtmf_sequence: str,
        send_callback: Callable[[str], Any]
    ) -> bool:
        """
        Handle retrieve parked call sequence (*0xxx)
        
        Args:
            conversation_id: Conversation ID
            dtmf_sequence: DTMF sequence
            send_callback: Callback function to send responses
            
        Returns:
            True if successful
        """
        # Extract park ID
        import re
        match = re.match(r"^\*0(\d\d+)$", dtmf_sequence)
        if not match:
            await send_callback(f"Invalid retrieve parked call sequence: {dtmf_sequence}")
            return False
        
        park_id = match.group(1)
        
        logger.info(
            "Handling retrieve parked call sequence",
            conversation_id=conversation_id,
            park_id=park_id
        )
        
        await send_callback(f"Retrieving parked call with ID: {park_id}")
        
        # Store the action in the session
        session = self.stasis_sessions.get(conversation_id) or self.active_sessions.get(conversation_id)
        if session:
            session["last_action"] = "retrieve_parked_call"
            session["park_id"] = park_id
        
        return True