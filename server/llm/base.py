from abc import ABC, abstractmethod
from typing import AsyncIterator


class LLMProvider(ABC):
    @abstractmethod
    async def stream_chat(
        self,
        messages: list[dict[str, str]],
    ) -> AsyncIterator[str]: ...
