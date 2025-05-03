"""
SpiritLink RTT Bridge
Logger configuration
"""

import logging
import os
import sys
from typing import Any

import structlog


def setup_logger() -> Any:
    """
    Set up structured logging for the application
    
    Returns:
        structlog.BoundLogger: Configured logger instance
    """
    log_level = os.getenv("LOG_LEVEL", "INFO").upper()
    
    # Configure standard logging
    logging.basicConfig(
        format="%(message)s",
        stream=sys.stdout,
        level=getattr(logging, log_level)
    )
    
    # Configure structlog
    structlog.configure(
        processors=[
            structlog.stdlib.filter_by_level,
            structlog.stdlib.add_logger_name,
            structlog.stdlib.add_log_level,
            structlog.stdlib.PositionalArgumentsFormatter(),
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.processors.StackInfoRenderer(),
            structlog.processors.format_exc_info,
            structlog.processors.UnicodeDecoder(),
            structlog.processors.JSONRenderer()
        ],
        context_class=dict,
        logger_factory=structlog.stdlib.LoggerFactory(),
        wrapper_class=structlog.stdlib.BoundLogger,
        cache_logger_on_first_use=True,
    )
    
    # Create and return logger
    logger = structlog.get_logger("spiritlink")
    logger.info("Logger initialized", log_level=log_level)
    
    return logger