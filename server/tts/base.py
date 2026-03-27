from abc import ABC, abstractmethod
from typing import AsyncIterator


class TTSProvider(ABC):
    sample_rate: int = 24000

    @abstractmethod
    async def synthesize(self, text: str, voice_id: str = "") -> AsyncIterator[bytes]: ...

    async def close(self) -> None:
        pass
