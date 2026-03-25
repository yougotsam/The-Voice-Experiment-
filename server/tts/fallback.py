import logging
from typing import AsyncIterator

from server.tts.base import TTSProvider

logger = logging.getLogger(__name__)


class FallbackTTS(TTSProvider):
    def __init__(self, providers: list[TTSProvider]):
        if not providers:
            raise ValueError("At least one TTS provider is required")
        self._providers = providers
        self._active_index = 0

    @property
    def sample_rate(self) -> int:
        return self._providers[self._active_index].sample_rate

    @sample_rate.setter
    def sample_rate(self, value: int) -> None:
        self._providers[self._active_index].sample_rate = value

    async def synthesize(self, text: str) -> AsyncIterator[bytes]:
        for i, provider in enumerate(self._providers):
            try:
                async for chunk in provider.synthesize(text):
                    self._active_index = i
                    yield chunk
                return
            except Exception:
                name = type(provider).__name__
                logger.warning("TTS provider %s failed, trying next", name)
                continue
        raise RuntimeError("All TTS providers failed")

    async def close(self) -> None:
        for provider in self._providers:
            try:
                await provider.close()
            except Exception:
                pass
