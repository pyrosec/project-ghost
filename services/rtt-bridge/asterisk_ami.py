"""
Asterisk AMI Client
Async client for Asterisk Manager Interface to control calls
"""

import asyncio
import os
from typing import Dict, Any, Optional, Callable, Awaitable

import structlog

logger = structlog.get_logger("spiritlink.ami")


class AsteriskAMI:
    """
    Async Asterisk Manager Interface client for call control
    """

    def __init__(
        self,
        host: str = None,
        port: int = None,
        username: str = None,
        secret: str = None
    ):
        """
        Initialize AMI client

        Args:
            host: Asterisk host (default from env ASTERISK_HOST)
            port: AMI port (default from env ASTERISK_PORT or 5038)
            username: AMI username (default from env AMI_USERNAME)
            secret: AMI secret (default from env AMI_SECRET)
        """
        self.host = host or os.environ.get("ASTERISK_HOST", "localhost")
        self.port = port or int(os.environ.get("ASTERISK_PORT", "5038"))
        self.username = username or os.environ.get("AMI_USERNAME", "admin")
        self.secret = secret or os.environ.get("AMI_SECRET", "")

        self.reader: Optional[asyncio.StreamReader] = None
        self.writer: Optional[asyncio.StreamWriter] = None
        self.connected = False
        self._action_id = 0
        self._pending_actions: Dict[str, asyncio.Future] = {}
        self._event_handlers: Dict[str, Callable[[Dict[str, str]], Awaitable[None]]] = {}
        self._reader_task: Optional[asyncio.Task] = None

        logger.info("AMI client initialized", host=self.host, port=self.port)

    async def connect(self) -> bool:
        """
        Connect to Asterisk AMI and login

        Returns:
            True if connected and logged in successfully
        """
        try:
            logger.info("Connecting to AMI", host=self.host, port=self.port)

            self.reader, self.writer = await asyncio.open_connection(
                self.host, self.port
            )

            # Read welcome message
            welcome = await self.reader.readline()
            logger.debug("AMI welcome", message=welcome.decode().strip())

            # Start reader task
            self._reader_task = asyncio.create_task(self._read_loop())

            # Login
            response = await self.send_action({
                "Action": "Login",
                "Username": self.username,
                "Secret": self.secret
            })

            if response.get("Response") == "Success":
                self.connected = True
                logger.info("AMI login successful")
                return True
            else:
                logger.error("AMI login failed", response=response)
                await self.disconnect()
                return False

        except Exception as e:
            logger.error("AMI connection failed", error=str(e))
            return False

    async def disconnect(self) -> None:
        """Disconnect from AMI"""
        self.connected = False

        if self._reader_task:
            self._reader_task.cancel()
            try:
                await self._reader_task
            except asyncio.CancelledError:
                pass

        if self.writer:
            try:
                await self.send_action({"Action": "Logoff"})
            except Exception:
                pass
            self.writer.close()
            try:
                await self.writer.wait_closed()
            except Exception:
                pass

        self.reader = None
        self.writer = None
        logger.info("AMI disconnected")

    async def send_action(self, action: Dict[str, str], timeout: float = 30.0) -> Dict[str, str]:
        """
        Send an AMI action and wait for response

        Args:
            action: Action dictionary with Action key and parameters
            timeout: Timeout in seconds

        Returns:
            Response dictionary
        """
        if not self.writer:
            raise RuntimeError("AMI not connected")

        # Generate action ID
        self._action_id += 1
        action_id = f"spiritlink-{self._action_id}"
        action["ActionID"] = action_id

        # Create future for response
        future = asyncio.get_event_loop().create_future()
        self._pending_actions[action_id] = future

        # Send action
        message = self._format_action(action)
        logger.debug("Sending AMI action", action=action.get("Action"), action_id=action_id)
        self.writer.write(message.encode())
        await self.writer.drain()

        try:
            # Wait for response
            response = await asyncio.wait_for(future, timeout)
            return response
        except asyncio.TimeoutError:
            logger.error("AMI action timeout", action_id=action_id)
            del self._pending_actions[action_id]
            return {"Response": "Error", "Message": "Timeout"}

    def _format_action(self, action: Dict[str, str]) -> str:
        """Format action as AMI message"""
        lines = []
        for key, value in action.items():
            lines.append(f"{key}: {value}")
        lines.append("")
        lines.append("")
        return "\r\n".join(lines)

    async def _read_loop(self) -> None:
        """Read and process AMI messages"""
        current_message: Dict[str, str] = {}

        while self.reader and not self.reader.at_eof():
            try:
                line = await self.reader.readline()
                if not line:
                    break

                line = line.decode().strip()

                if not line:
                    # Empty line = end of message
                    if current_message:
                        await self._handle_message(current_message)
                        current_message = {}
                elif ": " in line:
                    key, value = line.split(": ", 1)
                    current_message[key] = value

            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error("AMI read error", error=str(e))
                break

        logger.debug("AMI read loop ended")

    async def _handle_message(self, message: Dict[str, str]) -> None:
        """Handle received AMI message"""
        action_id = message.get("ActionID")

        # Check if this is a response to a pending action
        if action_id and action_id in self._pending_actions:
            future = self._pending_actions.pop(action_id)
            if not future.done():
                future.set_result(message)
            return

        # Check if this is an event
        event = message.get("Event")
        if event:
            logger.debug("AMI event received", event=event)
            handler = self._event_handlers.get(event)
            if handler:
                try:
                    await handler(message)
                except Exception as e:
                    logger.error("AMI event handler error", event=event, error=str(e))

    def register_event_handler(
        self,
        event: str,
        handler: Callable[[Dict[str, str]], Awaitable[None]]
    ) -> None:
        """
        Register handler for AMI events

        Args:
            event: Event name (e.g., "Hangup", "DialEnd")
            handler: Async handler function
        """
        self._event_handlers[event] = handler
        logger.debug("Registered AMI event handler", event=event)

    async def originate_tty_call(
        self,
        session_id: str,
        to_number: str,
        from_user: str,
        caller_id: str = None
    ) -> Dict[str, str]:
        """
        Originate an outbound TTY call

        Args:
            session_id: TTY session ID
            to_number: Destination phone number
            from_user: XMPP user initiating the call
            caller_id: Optional caller ID

        Returns:
            AMI response
        """
        if caller_id is None:
            caller_id = os.environ.get("VOIPMS_CALLERID", "5125720271")

        # Build channel variables
        variables = f"TTY_SESSION_ID={session_id},TTY_NUMBER={to_number},TTY_USER={from_user}"

        action = {
            "Action": "Originate",
            "Channel": "Local/tty_interactive@tty_outbound",
            "Context": "tty_outbound",
            "Exten": "tty_interactive",
            "Priority": "1",
            "Variable": variables,
            "CallerID": f'"TTY" <{caller_id}>',
            "Timeout": "60000",
            "Async": "true"
        }

        logger.info("Originating TTY call",
                   session_id=session_id,
                   to_number=to_number,
                   from_user=from_user)

        return await self.send_action(action)

    async def hangup_channel(self, channel: str) -> Dict[str, str]:
        """
        Hangup a channel

        Args:
            channel: Channel name to hangup

        Returns:
            AMI response
        """
        logger.info("Hanging up channel", channel=channel)

        return await self.send_action({
            "Action": "Hangup",
            "Channel": channel
        })

    async def get_var(self, channel: str, variable: str) -> Optional[str]:
        """
        Get a channel variable

        Args:
            channel: Channel name
            variable: Variable name

        Returns:
            Variable value or None
        """
        response = await self.send_action({
            "Action": "Getvar",
            "Channel": channel,
            "Variable": variable
        })

        if response.get("Response") == "Success":
            return response.get("Value")
        return None

    async def set_var(self, channel: str, variable: str, value: str) -> bool:
        """
        Set a channel variable

        Args:
            channel: Channel name
            variable: Variable name
            value: Variable value

        Returns:
            True if successful
        """
        response = await self.send_action({
            "Action": "Setvar",
            "Channel": channel,
            "Variable": variable,
            "Value": value
        })

        return response.get("Response") == "Success"
