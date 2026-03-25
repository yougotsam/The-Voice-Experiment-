from abc import ABC, abstractmethod
from typing import AsyncIterator


class TTSProvider(ABC):
    @abstractmethod
    async def synthesize(self, text: str) -> AsyncIterator[bytes]: ...

    async def close(self) -> None:
        pass
