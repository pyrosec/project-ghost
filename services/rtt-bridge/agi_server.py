"""
SpiritLink RTT Bridge
AGI Server for Asterisk integration
"""

import asyncio
import os
import socket
import tempfile
import uuid
from urllib.parse import urlparse, parse_qs, unquote
from typing import Dict, Any, Optional, List, Tuple, TYPE_CHECKING

import structlog

from agi_session import AGISession
from rtt_handler import RTTHandler
from baudot import TTYToneGenerator

if TYPE_CHECKING:
    from tty_session_manager import TTYSessionManager

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
        self.tty_generator = TTYToneGenerator()
        self.tty_manager: Optional["TTYSessionManager"] = None

        # Directory for TTY audio files (shared with Asterisk)
        self.tty_audio_dir = os.environ.get("TTY_AUDIO_DIR", "/var/lib/asterisk/sounds/tty")
        os.makedirs(self.tty_audio_dir, exist_ok=True)

        logger.info("AGI Server initialized", host=host, port=port, tty_audio_dir=self.tty_audio_dir)

    def set_tty_manager(self, tty_manager: "TTYSessionManager") -> None:
        """Set the TTY session manager"""
        self.tty_manager = tty_manager
        logger.info("TTY session manager set on AGI server")
    
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
            # Parse the AGI request to determine the handler
            agi_request = agi_env.get("agi_request", "")
            parsed = urlparse(agi_request)
            path = parsed.path.strip("/")
            query_params = parse_qs(parsed.query)

            logger.info("AGI request received", path=path, query_params=query_params)

            if path == "tty_send":
                # Handle TTY/Baudot message sending (audio tones)
                message = query_params.get("message", [""])[0]
                call_id = query_params.get("call_id", ["unknown"])[0]
                message = unquote(message)
                await self.handle_tty_send(session, message, call_id)
            elif path == "rtt_send":
                # Handle one-shot RTT message sending (SIP MESSAGE based)
                message = query_params.get("message", [""])[0]
                call_id = query_params.get("call_id", ["unknown"])[0]
                # URL-decode the message
                message = unquote(message)
                await self.handle_rtt_send(session, message, call_id)
            elif path == "tty_session":
                # Handle TTY session status updates from Asterisk dialplan
                action = query_params.get("action", [""])[0]
                session_id = query_params.get("session_id", [""])[0]
                reason = query_params.get("reason", [""])[0]
                channel = query_params.get("channel", [""])[0]
                await self.handle_tty_session(session, action, session_id, reason, channel)
            elif path == "tty_interactive":
                # Handle bidirectional TTY communication during call
                session_id = query_params.get("session_id", [""])[0]
                await self.handle_tty_interactive(session, session_id)
            else:
                # Default: Handle interactive RTT session (rtt_bridge)
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

    async def handle_rtt_send(self, session: AGISession, message: str, call_id: str) -> None:
        """
        Handle one-shot RTT message sending

        Args:
            session: AGI session
            message: Message to send
            call_id: Call ID for logging
        """
        logger.info("RTT send started", call_id=call_id, message_length=len(message))

        if not message:
            logger.warn("RTT send: empty message", call_id=call_id)
            return

        try:
            # Send message character by character for RTT effect
            for i, char in enumerate(message):
                success = await session.send_text(char)
                if not success:
                    logger.warn("RTT send: failed to send character",
                               call_id=call_id, char_index=i)
                    break
                # Small delay between characters (50ms for natural typing feel)
                await asyncio.sleep(0.05)

            # Send newline to indicate end of message
            await session.send_text("\n")

            logger.info("RTT send completed", call_id=call_id, chars_sent=len(message))

        except Exception as e:
            logger.error("RTT send error", call_id=call_id, error=str(e))

    async def handle_tty_send(self, session: AGISession, message: str, call_id: str) -> None:
        """
        Handle TTY/Baudot message sending via audio tones

        Args:
            session: AGI session
            message: Message to send
            call_id: Call ID for logging
        """
        logger.info("TTY send started", call_id=call_id, message_length=len(message), message=message)

        if not message:
            logger.warn("TTY send: empty message", call_id=call_id)
            return

        # Generate unique filename for this call
        audio_filename = f"tty_{call_id}_{uuid.uuid4().hex[:8]}"
        audio_path = os.path.join(self.tty_audio_dir, f"{audio_filename}.wav")

        try:
            # Generate TTY audio
            logger.info("Generating TTY audio", call_id=call_id, path=audio_path)
            self.tty_generator.save_wav(message, audio_path)

            # Calculate expected duration for logging
            samples = self.tty_generator.generate_text(message)
            duration = len(samples) / self.tty_generator.sample_rate
            logger.info("TTY audio generated", call_id=call_id, duration_sec=round(duration, 2))

            # Play the audio file via AGI STREAM FILE
            # Path for Asterisk is relative to sounds directory without extension
            asterisk_path = f"tty/{audio_filename}"
            logger.info("Streaming TTY audio", call_id=call_id, asterisk_path=asterisk_path)

            result = await session.execute_command(f'STREAM FILE "{asterisk_path}" ""')
            logger.info("TTY stream completed", call_id=call_id, result=result)

            # Small delay to ensure audio completes
            await asyncio.sleep(0.5)

            logger.info("TTY send completed", call_id=call_id)

        except Exception as e:
            logger.error("TTY send error", call_id=call_id, error=str(e))
        finally:
            # Clean up audio file
            try:
                if os.path.exists(audio_path):
                    os.remove(audio_path)
                    logger.debug("TTY audio file cleaned up", path=audio_path)
            except Exception as e:
                logger.warn("Failed to clean up TTY audio file", path=audio_path, error=str(e))

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

    async def handle_tty_session(
        self,
        session: AGISession,
        action: str,
        session_id: str,
        reason: str = "",
        channel: str = ""
    ) -> None:
        """
        Handle TTY session status updates from Asterisk dialplan

        Args:
            session: AGI session
            action: Action type (answered, failed, ended)
            session_id: TTY session ID
            reason: Failure reason (for failed action)
            channel: Asterisk channel name
        """
        logger.info("TTY session callback",
                   action=action,
                   session_id=session_id,
                   reason=reason,
                   channel=channel)

        if not self.tty_manager:
            logger.error("TTY manager not available")
            return

        try:
            if action == "answered":
                # Set the channel on the session for later hangup
                if channel:
                    self.tty_manager.set_channel(session_id, channel)
                await self.tty_manager.handle_call_answered(session_id)

            elif action == "failed":
                await self.tty_manager.handle_call_failed(session_id, reason)

            elif action == "ended":
                await self.tty_manager.handle_call_ended(session_id)

            else:
                logger.warn("Unknown TTY session action", action=action)

        except Exception as e:
            logger.error("Error handling TTY session callback",
                        action=action,
                        session_id=session_id,
                        error=str(e))

    async def handle_tty_interactive(self, session: AGISession, session_id: str) -> None:
        """
        Handle bidirectional TTY communication during an active call

        This method runs a loop that:
        1. Checks for user text from Redis queue and sends as TTY tones
        2. Checks for end signal to terminate
        3. Receives TTY tones and forwards text to XMPP (TODO: TTY receive)

        Args:
            session: AGI session
            session_id: TTY session ID
        """
        logger.info("TTY interactive session started", session_id=session_id)

        if not self.tty_manager:
            logger.error("TTY manager not available", session_id=session_id)
            return

        tty_session = self.tty_manager.get_session(session_id)
        if not tty_session:
            logger.error("TTY session not found", session_id=session_id)
            return

        try:
            while True:
                # Check for end signal
                should_end = await self.tty_manager.check_end_signal(session_id)
                if should_end:
                    logger.info("TTY session end signal received", session_id=session_id)
                    break

                # Check session status (might have ended externally)
                current_session = self.tty_manager.get_session(session_id)
                if not current_session or current_session.status != "answered":
                    logger.info("TTY session no longer active", session_id=session_id)
                    break

                # Check for outbound text from user
                text = await self.tty_manager.get_pending_text(session_id)
                if text:
                    logger.debug("Sending TTY text", session_id=session_id, text_length=len(text))
                    await self._send_tty_audio(session, text, session_id)

                # Small delay to prevent tight loop
                await asyncio.sleep(0.2)

        except Exception as e:
            logger.error("TTY interactive session error", session_id=session_id, error=str(e))

        logger.info("TTY interactive session ended", session_id=session_id)

    async def _send_tty_audio(self, session: AGISession, text: str, session_id: str) -> None:
        """
        Generate and send TTY audio tones for text

        Args:
            session: AGI session
            text: Text to send
            session_id: Session ID for logging/file naming
        """
        # Generate unique filename
        audio_filename = f"tty_{session_id}_{uuid.uuid4().hex[:8]}"
        audio_path = os.path.join(self.tty_audio_dir, f"{audio_filename}.wav")

        try:
            # Generate TTY audio
            self.tty_generator.save_wav(text, audio_path)

            # Calculate duration for logging
            samples = self.tty_generator.generate_text(text)
            duration = len(samples) / self.tty_generator.sample_rate
            logger.debug("TTY audio generated",
                        session_id=session_id,
                        duration_sec=round(duration, 2))

            # Play via AGI STREAM FILE
            asterisk_path = f"tty/{audio_filename}"
            result = await session.execute_command(f'STREAM FILE "{asterisk_path}" ""')
            logger.debug("TTY stream completed", session_id=session_id, result=result)

            # Small delay after playback
            await asyncio.sleep(0.3)

        except Exception as e:
            logger.error("TTY audio send error", session_id=session_id, error=str(e))
        finally:
            # Clean up audio file
            try:
                if os.path.exists(audio_path):
                    os.remove(audio_path)
            except Exception:
                pass