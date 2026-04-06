import logging
from typing import AsyncIterator

from server.tts.base import TTSProvider
from server.tts.errors import TTSError

logger = logging.getLogger(__name__)


class FallbackTTS(TTSProvider):
    provider_name = "fallback"

    def __init__(self, providers: list[TTSProvider]):
        if not providers:
            raise ValueError("At least one TTS provider is required")
        self._providers = providers
        self._active_index = 0
        self.active_provider_name: str = getattr(providers[0], "provider_name", "unknown")

    @property
    def sample_rate(self) -> int:
        return self._providers[self._active_index].sample_rate

    @sample_rate.setter
    def sample_rate(self, value: int) -> None:
        self._providers[self._active_index].sample_rate = value

    def set_voice(self, voice: str) -> bool:
        primary = self._providers[0]
        if hasattr(primary, "set_voice"):
            return primary.set_voice(voice)
        return True

    async def synthesize(self, text: str, voice_id: str = "") -> AsyncIterator[bytes]:
        errors: list[tuple[str, str]] = []
        for i, provider in enumerate(self._providers):
            name = getattr(provider, "provider_name", type(provider).__name__)
            if not provider.is_available():
                logger.warning("TTS provider %s not available, skipping", name)
                errors.append((name, "not available"))
                continue
            started = False
            try:
                async for chunk in provider.synthesize(text, voice_id=voice_id):
                    started = True
                    self._active_index = i
                    self.active_provider_name = name
                    yield chunk
                return
            except Exception as exc:
                if started:
                    logger.error("TTS provider %s failed mid-stream, cannot retry", name)
                    raise
                logger.warning("TTS provider %s failed: %s, trying next", name, exc)
                errors.append((name, str(exc)))
                continue
        raise TTSError("fallback", f"All TTS providers failed: {errors}")

    async def close(self) -> None:
        for provider in self._providers:
            try:
                await provider.close()
            except Exception:
                pass
