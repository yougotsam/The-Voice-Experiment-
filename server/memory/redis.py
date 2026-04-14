import json
import logging
from typing import Any

from redis.asyncio import Redis

logger = logging.getLogger(__name__)

MAX_PERSISTED_MESSAGES = 50


class RedisMemory:
    def __init__(self, redis_url: str):
        self._url = redis_url
        self._redis: Redis | None = None

    async def connect(self) -> None:
        self._redis = Redis.from_url(self._url, decode_responses=True)
        try:
            await self._redis.ping()
            logger.info("Redis memory connected: %s", self._url)
        except Exception:
            logger.warning("Redis not reachable at %s — memory will be session-only", self._url)
            await self._redis.close()
            self._redis = None

    async def close(self) -> None:
        if self._redis:
            await self._redis.close()
            self._redis = None

    @property
    def available(self) -> bool:
        return self._redis is not None

    def _key(self, user_id: str) -> str:
        return f"zeebsos:memory:{user_id}"

    async def load_history(self, user_id: str) -> list[dict[str, Any]]:
        if not self._redis:
            return []
        try:
            raw = await self._redis.get(self._key(user_id))
            if not raw:
                return []
            data = json.loads(raw)
            return data.get("history", [])
        except Exception:
            logger.warning("Failed to load memory for %s", user_id, exc_info=True)
            return []

    async def save_history(self, user_id: str, history: list[dict[str, Any]]) -> None:
        if not self._redis:
            return
        trimmed = history[-MAX_PERSISTED_MESSAGES:]
        try:
            await self._redis.set(
                self._key(user_id),
                json.dumps({"history": trimmed}),
                ex=86400 * 30,
            )
        except Exception:
            logger.warning("Failed to save memory for %s", user_id, exc_info=True)

    async def get_summary(self, user_id: str) -> str:
        if not self._redis:
            return ""
        try:
            raw = await self._redis.get(self._key(user_id))
            if not raw:
                return ""
            data = json.loads(raw)
            history = data.get("history", [])
            if not history:
                return ""
            last_user = ""
            last_assistant = ""
            for msg in reversed(history):
                if msg.get("role") == "user" and not last_user:
                    last_user = str(msg.get("content", ""))[:200]
                elif msg.get("role") == "assistant" and not last_assistant:
                    last_assistant = str(msg.get("content", ""))[:200]
                if last_user and last_assistant:
                    break
            if not last_user and not last_assistant:
                return ""
            return f"Previous session context — User: {last_user} | Zeebs: {last_assistant}"
        except Exception:
            logger.warning("Failed to get summary for %s", user_id, exc_info=True)
            return ""


