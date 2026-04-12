from __future__ import annotations

import logging
from typing import Any, Awaitable, Callable

logger = logging.getLogger(__name__)

SendFn = Callable[[str, dict[str, Any]], Awaitable[None]]

MAX_CONNECTIONS = 100


class ConnectionManager:
    def __init__(self) -> None:
        self._connections: dict[str, SendFn] = {}

    @property
    def at_capacity(self) -> bool:
        return len(self._connections) >= MAX_CONNECTIONS

    def register(self, session_id: str, send_fn: SendFn) -> None:
        self._connections[session_id] = send_fn
        logger.info("WS registered for broadcasts: %s (%d total)", session_id, len(self._connections))

    def unregister(self, session_id: str) -> None:
        self._connections.pop(session_id, None)
        logger.info("WS unregistered from broadcasts: %s (%d remaining)", session_id, len(self._connections))

    async def broadcast(self, msg_type: str, data: dict[str, Any]) -> None:
        for sid, send_fn in list(self._connections.items()):
            try:
                await send_fn(msg_type, data)
            except Exception:
                logger.warning("Broadcast failed for session %s, removing", sid)
                self._connections.pop(sid, None)

    @property
    def active_count(self) -> int:
        return len(self._connections)


manager = ConnectionManager()
