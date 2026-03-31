import logging
import ssl
from typing import AsyncIterator

import certifi
import httpx

from server.tts.base import TTSProvider

logger = logging.getLogger(__name__)

XAI_TTS_URL = "https://api.x.ai/v1/tts"

VOICES = {"eve", "ara", "rex", "sal", "leo"}


class XaiTTS(TTSProvider):
    sample_rate: int = 24000

    MAX_INPUT_CHARS = 4000

    def __init__(self, api_key: str, voice: str = "eve"):
        self._api_key = api_key
        self._voice = voice if voice in VOICES else "eve"
        ssl_ctx = ssl.create_default_context(cafile=certifi.where())
        self._client = httpx.AsyncClient(timeout=30.0, verify=ssl_ctx)
        logger.info("XaiTTS init: voice=%s key=%s", self._voice, "SET" if api_key else "MISSING")

    def set_voice(self, voice: str) -> bool:
        if voice not in VOICES:
            logger.warning("Unknown xAI voice '%s', keeping '%s'", voice, self._voice)
            return False
        self._voice = voice
        logger.info("xAI TTS voice changed to '%s'", voice)
        return True

    async def synthesize(self, text: str, voice_id: str = "") -> AsyncIterator[bytes]:
        if not self._api_key:
            raise RuntimeError("xAI API key not configured")
        active_voice = voice_id or self._voice
        if active_voice not in VOICES:
            active_voice = self._voice
        if not text or not text.strip():
            return
        for chunk in self._split_text(text):
            payload = {
                "text": chunk,
                "voice_id": active_voice,
                "language": "en",
                "output_format": {
                    "codec": "pcm",
                    "sample_rate": self.sample_rate,
                },
            }
            response = await self._client.post(
                XAI_TTS_URL,
                headers={
                    "Authorization": f"Bearer {self._api_key}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )
            if response.status_code != 200:
                body = response.text[:500]
                logger.error("xAI TTS %s: %s", response.status_code, body)
                raise RuntimeError(f"xAI TTS HTTP {response.status_code}: {body}")

            yield response.content

    async def close(self) -> None:
        await self._client.aclose()
