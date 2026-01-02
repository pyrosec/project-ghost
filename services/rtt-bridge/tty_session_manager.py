"""
TTY Session Manager
Manages TTY call lifecycle and bidirectional communication
"""

import asyncio
import json
import os
from dataclasses import dataclass, field
from datetime import datetime
from typing import Dict, Optional, Any

import structlog

logger = structlog.get_logger("spiritlink.tty.session")


@dataclass
class TTYSession:
    """Represents an active TTY call session"""
    session_id: str
    from_user: str
    to_number: str
    status: str = "initiating"  # initiating, ringing, answered, ended, failed
    created_at: datetime = field(default_factory=datetime.now)
    connected_at: Optional[datetime] = None
    ended_at: Optional[datetime] = None
    asterisk_channel: Optional[str] = None


class TTYSessionManager:
    """
    Manages TTY sessions and communication between Prosody and Asterisk
    """

    def __init__(self, redis_client, ami_client=None):
        """
        Initialize TTY Session Manager

        Args:
            redis_client: Async Redis client
            ami_client: AsteriskAMI client (optional, can be set later)
        """
        self.redis = redis_client
        self.ami = ami_client
        self.sessions: Dict[str, TTYSession] = {}
        self._running = False

        logger.info("TTY Session Manager initialized")

    def set_ami_client(self, ami_client):
        """Set the AMI client after initialization"""
        self.ami = ami_client

    async def process_command(self, command: dict) -> None:
        """
        Process a command from the tty-out queue

        Args:
            command: Command dictionary with action and parameters
        """
        action = command.get("action")

        logger.info("Processing TTY command", action=action, session_id=command.get("session_id"))

        try:
            if action == "start_call":
                await self.start_call(command)
            elif action == "send_text":
                await self.send_text(command)
            elif action == "end_call":
                await self.end_call(command)
            else:
                logger.warn("Unknown TTY command", action=action)
        except Exception as e:
            logger.error("Error processing TTY command", action=action, error=str(e))

    async def start_call(self, cmd: dict) -> None:
        """
        Initiate an outbound TTY call via Asterisk

        Args:
            cmd: Command with session_id, from_user, to_number
        """
        session_id = cmd["session_id"]
        from_user = cmd["from_user"]
        to_number = cmd["to_number"]

        # Create session
        session = TTYSession(
            session_id=session_id,
            from_user=from_user,
            to_number=to_number,
            status="ringing"
        )
        self.sessions[session_id] = session

        logger.info("Starting TTY call",
                   session_id=session_id,
                   from_user=from_user,
                   to_number=to_number)

        # Send ringing status
        await self.push_status(session, "ringing", f"Calling {to_number}...")

        # Originate call via AMI
        if self.ami:
            try:
                await self.ami.originate_tty_call(session)
            except Exception as e:
                logger.error("Failed to originate TTY call", session_id=session_id, error=str(e))
                await self.handle_call_failed(session_id, str(e))
        else:
            logger.error("AMI client not available", session_id=session_id)
            await self.handle_call_failed(session_id, "AMI not connected")

    async def send_text(self, cmd: dict) -> None:
        """
        Queue text to be sent during an active call

        Args:
            cmd: Command with session_id and text
        """
        session_id = cmd["session_id"]
        text = cmd.get("text", "")

        session = self.sessions.get(session_id)
        if not session:
            logger.warn("Send text for unknown session", session_id=session_id)
            return

        if session.status != "answered":
            logger.warn("Send text for non-answered call", session_id=session_id, status=session.status)
            return

        # Queue text for the AGI handler to pick up
        await self.redis.rpush(f'tty-user-text:{session_id}', text)

        logger.debug("Queued TTY text for sending",
                    session_id=session_id,
                    text_length=len(text))

    async def end_call(self, cmd: dict) -> None:
        """
        Terminate an active TTY call

        Args:
            cmd: Command with session_id
        """
        session_id = cmd["session_id"]

        session = self.sessions.get(session_id)
        if not session:
            logger.warn("End call for unknown session", session_id=session_id)
            return

        logger.info("Ending TTY call", session_id=session_id)

        # Signal the AGI handler to terminate
        await self.redis.set(f'tty-end-signal:{session_id}', '1', ex=60)

        # If we have the channel, hang it up via AMI
        if self.ami and session.asterisk_channel:
            try:
                await self.ami.hangup_channel(session.asterisk_channel)
            except Exception as e:
                logger.error("Failed to hangup channel", session_id=session_id, error=str(e))

    async def handle_call_answered(self, session_id: str) -> None:
        """
        Called when Asterisk reports the call was answered

        Args:
            session_id: The session ID
        """
        session = self.sessions.get(session_id)
        if not session:
            logger.warn("Answer event for unknown session", session_id=session_id)
            return

        session.status = "answered"
        session.connected_at = datetime.now()

        logger.info("TTY call answered", session_id=session_id)

        await self.push_status(session, "answered", "Connected! Send messages now.")

    async def handle_call_failed(self, session_id: str, reason: str) -> None:
        """
        Called when the call fails to connect

        Args:
            session_id: The session ID
            reason: Failure reason (e.g., BUSY, NOANSWER, CONGESTION)
        """
        session = self.sessions.get(session_id)
        if not session:
            logger.warn("Failed event for unknown session", session_id=session_id)
            return

        session.status = "failed"
        session.ended_at = datetime.now()

        logger.info("TTY call failed", session_id=session_id, reason=reason)

        # Map common dial statuses to friendly messages
        reason_messages = {
            "BUSY": "Line busy",
            "NOANSWER": "No answer",
            "CONGESTION": "Network congestion",
            "CHANUNAVAIL": "Service unavailable",
            "CANCEL": "Call cancelled"
        }
        message = reason_messages.get(reason, f"Call failed: {reason}")

        await self.push_status(session, "failed", message)

        # Cleanup
        await self._cleanup_session(session_id)

    async def handle_call_ended(self, session_id: str) -> None:
        """
        Called when the call ends (after being answered)

        Args:
            session_id: The session ID
        """
        session = self.sessions.get(session_id)
        if not session:
            logger.warn("Ended event for unknown session", session_id=session_id)
            return

        session.status = "ended"
        session.ended_at = datetime.now()

        # Calculate duration
        duration_str = ""
        if session.connected_at:
            duration = (session.ended_at - session.connected_at).total_seconds()
            minutes = int(duration // 60)
            seconds = int(duration % 60)
            duration_str = f" Duration: {minutes}m {seconds}s"

        logger.info("TTY call ended",
                   session_id=session_id,
                   duration=duration_str.strip())

        await self.push_status(session, "ended", f"Call ended.{duration_str}")

        # Cleanup
        await self._cleanup_session(session_id)

    async def handle_incoming_text(self, session_id: str, text: str) -> None:
        """
        Called when text is received from the remote party

        Args:
            session_id: The session ID
            text: The received text
        """
        session = self.sessions.get(session_id)
        if not session:
            logger.warn("Incoming text for unknown session", session_id=session_id)
            return

        logger.debug("Received TTY text",
                    session_id=session_id,
                    text_length=len(text))

        await self.push_text(session, text)

    async def push_status(self, session: TTYSession, status: str, message: str) -> None:
        """
        Push a status update to the tty-in queue (for Prosody)

        Args:
            session: The TTY session
            status: Status string (ringing, answered, ended, failed)
            message: Human-readable message
        """
        data = {
            "type": "status",
            "session_id": session.session_id,
            "to_user": session.from_user,
            "from_number": session.to_number,
            "status": status,
            "message": message
        }

        # Add duration on ended
        if status == "ended" and session.connected_at and session.ended_at:
            data["duration"] = int((session.ended_at - session.connected_at).total_seconds())

        await self.redis.rpush('tty-in', json.dumps(data))

        logger.debug("Pushed status to tty-in",
                    session_id=session.session_id,
                    status=status)

    async def push_text(self, session: TTYSession, text: str) -> None:
        """
        Push received text to the tty-in queue (for Prosody)

        Args:
            session: The TTY session
            text: The received text
        """
        data = {
            "type": "text",
            "session_id": session.session_id,
            "to_user": session.from_user,
            "from_number": session.to_number,
            "text": text
        }

        await self.redis.rpush('tty-in', json.dumps(data))

    async def _cleanup_session(self, session_id: str) -> None:
        """
        Clean up session resources

        Args:
            session_id: The session ID to clean up
        """
        # Remove from active sessions
        if session_id in self.sessions:
            del self.sessions[session_id]

        # Clean up Redis keys
        await self.redis.delete(f'tty-user-text:{session_id}')
        await self.redis.delete(f'tty-end-signal:{session_id}')

        logger.debug("Session cleaned up", session_id=session_id)

    def get_session(self, session_id: str) -> Optional[TTYSession]:
        """Get a session by ID"""
        return self.sessions.get(session_id)

    def set_channel(self, session_id: str, channel: str) -> None:
        """Set the Asterisk channel for a session"""
        session = self.sessions.get(session_id)
        if session:
            session.asterisk_channel = channel

    async def check_end_signal(self, session_id: str) -> bool:
        """Check if an end signal has been set for this session"""
        result = await self.redis.get(f'tty-end-signal:{session_id}')
        return result is not None

    async def get_pending_text(self, session_id: str) -> Optional[str]:
        """Get next pending text to send for a session"""
        result = await self.redis.lpop(f'tty-user-text:{session_id}')
        if result:
            return result.decode() if isinstance(result, bytes) else result
        return None
