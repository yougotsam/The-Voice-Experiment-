from abc import ABC, abstractmethod
from typing import AsyncIterator


class TTSProvider(ABC):
    sample_rate: int = 24000
    MAX_INPUT_CHARS: int = 2000

    @abstractmethod
    async def synthesize(self, text: str, voice_id: str = "") -> AsyncIterator[bytes]: ...

    async def close(self) -> None:
        pass

    @classmethod
    def _split_text(cls, text: str) -> list[str]:
        if len(text) <= cls.MAX_INPUT_CHARS:
            return [text]
        chunks: list[str] = []
        while text:
            if len(text) <= cls.MAX_INPUT_CHARS:
                chunks.append(text)
                break
            idx = text.rfind(" ", 0, cls.MAX_INPUT_CHARS)
            if idx <= 0:
                idx = cls.MAX_INPUT_CHARS
            chunks.append(text[:idx].rstrip())
            text = text[idx:].lstrip()
        return chunks
