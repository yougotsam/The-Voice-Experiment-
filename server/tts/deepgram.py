import logging
import ssl
from typing import AsyncIterator

import certifi
import httpx

from server.tts.base import TTSProvider
from server.tts.errors import raise_for_tts_status
from server.tts.retry import retry_post

logger = logging.getLogger(__name__)

DEEPGRAM_TTS_URL = "https://api.deepgram.com/v1/speak"

VOICES = {
    "aura-2-thalia-en",
    "aura-2-andromeda-en",
    "aura-2-apollo-en",
    "aura-2-arcas-en",
    "aura-2-athena-en",
    "aura-2-helios-en",
    "aura-2-luna-en",
    "aura-2-orion-en",
    "aura-2-perseus-en",
    "aura-2-stella-en",
}


class DeepgramTTS(TTSProvider):
    sample_rate: int = 24000
    provider_name = "deepgram"

    MAX_INPUT_CHARS = 2000

    def __init__(self, api_key: str, voice: str = "aura-2-thalia-en"):
        self._api_key = api_key
        self._voice = voice if voice in VOICES else "aura-2-thalia-en"
        ssl_ctx = ssl.create_default_context(cafile=certifi.where())
        self._client = httpx.AsyncClient(timeout=30.0, verify=ssl_ctx)
        logger.info("DeepgramTTS init: voice=%s key=%s", self._voice, "SET" if api_key else "MISSING")

    def is_available(self) -> bool:
        return bool(self._api_key)

    def set_voice(self, voice: str) -> bool:
        if voice not in VOICES:
            logger.warning("Unknown Deepgram voice '%s', keeping '%s'", voice, self._voice)
            return False
        self._voice = voice
        logger.info("Deepgram TTS voice changed to '%s'", voice)
        return True

    async def synthesize(self, text: str, voice_id: str = "") -> AsyncIterator[bytes]:
        active_voice = voice_id or self._voice
        if active_voice not in VOICES:
            active_voice = self._voice
        if not text or not text.strip():
            return
        for chunk in self._split_text(text):
            response = await retry_post(
                self._client,
                DEEPGRAM_TTS_URL,
                params={
                    "model": active_voice,
                    "encoding": "linear16",
                    "sample_rate": str(self.sample_rate),
                    "container": "none",
                },
                headers={
                    "Authorization": f"Token {self._api_key}",
                    "Content-Type": "application/json",
                },
                json={"text": chunk},
            )
            if response.status_code != 200:
                body = response.text[:500]
                logger.error("Deepgram TTS %s: %s", response.status_code, body)
                raise_for_tts_status(self.provider_name, response.status_code, body)

            yield response.content

    async def close(self) -> None:
        await self._client.aclose()
