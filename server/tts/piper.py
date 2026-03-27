import asyncio
import io
import logging
import wave
from typing import AsyncIterator

from server.tts.base import TTSProvider

logger = logging.getLogger(__name__)


class PiperTTS(TTSProvider):
    def __init__(self, model: str = "en_US-lessac-medium"):
        try:
            from piper import PiperVoice
        except ImportError:
            raise ImportError("piper-tts is not installed. Install with: pip install piper-tts")

        from piper.download import ensure_voice_exists, get_voices, find_voice

        data_dir = ensure_voice_exists(model, get_voices())
        model_path, config_path = find_voice(model, [data_dir])
        self._voice = PiperVoice.load(str(model_path), config_path=str(config_path))
        self.sample_rate = self._voice.config.sample_rate
        logger.info("Piper TTS loaded: %s (sample_rate=%d)", model, self.sample_rate)

    async def synthesize(self, text: str, voice_id: str = "") -> AsyncIterator[bytes]:
        loop = asyncio.get_running_loop()
        audio = await loop.run_in_executor(None, self._generate_sync, text)
        yield audio

    def _generate_sync(self, text: str) -> bytes:
        buf = io.BytesIO()
        with wave.open(buf, "wb") as wf:
            self._voice.synthesize(text, wf)

        buf.seek(44)
        return buf.read()
