from abc import ABC, abstractmethod
from typing import Any, AsyncIterator


class LLMProvider(ABC):
    @abstractmethod
    async def stream_chat(
        self,
        messages: list[dict],
        system_prompt: str = "",
        tools: list[dict] | None = None,
        max_tokens: int = 1024,
    ) -> AsyncIterator[str | dict[str, Any]]: ...
