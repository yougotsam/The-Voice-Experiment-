import logging
import ssl
from typing import AsyncIterator

import certifi
import httpx

from server.tts.base import TTSProvider
from server.tts.errors import TTSAuthError, raise_for_tts_status
from server.tts.retry import retry_post

logger = logging.getLogger(__name__)

CARTESIA_TTS_URL = "https://api.cartesia.ai/tts/bytes"

VOICES = {
    "a0e99841-438c-4a64-b679-ae501e7d6091": "Barbershop Man",
    "79a125e8-cd45-4c13-8a67-188112f4dd22": "British Lady",
    "b7d50908-b17c-442d-ad8d-7c56e74dd5d8": "California Girl",
    "c8f432c7-6ab8-4962-8649-99078c0e5f7b": "Confident Man",
    "e3827ec5-697a-4b7c-9c55-5aad3dff5b00": "Midwestern Woman",
    "41534e16-2966-4c6b-9670-111411def906": "Newsman",
    "694f9389-aac1-45b6-b726-9d9369183238": "Reflective Woman",
    "421b3369-f63f-4b03-8980-37a44df1d4e8": "Southern Man",
    "f9836c6e-a0bd-460e-9d3c-f7299fa60f94": "Storyteller Lady",
    "87748186-23bb-4571-8b3d-237a4cfc67e5": "Sweet Lady",
}

DEFAULT_VOICE_ID = "79a125e8-cd45-4c13-8a67-188112f4dd22"


class CartesiaTTS(TTSProvider):
    sample_rate: int = 24000
    provider_name = "cartesia"

    MAX_INPUT_CHARS = 2000

    def __init__(self, api_key: str, voice_id: str = DEFAULT_VOICE_ID):
        self._api_key = api_key
        self._voice_id = voice_id if voice_id in VOICES else DEFAULT_VOICE_ID
        ssl_ctx = ssl.create_default_context(cafile=certifi.where())
        self._client = httpx.AsyncClient(timeout=30.0, verify=ssl_ctx)
        logger.info("CartesiaTTS init: voice=%s key=%s", VOICES.get(self._voice_id, self._voice_id), "SET" if api_key else "MISSING")

    def is_available(self) -> bool:
        return bool(self._api_key)

    def set_voice(self, voice: str) -> bool:
        if voice not in VOICES:
            logger.warning("Unknown Cartesia voice '%s', keeping '%s'", voice, self._voice_id)
            return False
        self._voice_id = voice
        logger.info("Cartesia TTS voice changed to '%s' (%s)", VOICES.get(voice, voice), voice)
        return True

    async def synthesize(self, text: str, voice_id: str = "") -> AsyncIterator[bytes]:
        if not self._api_key:
            raise TTSAuthError(self.provider_name, "API key not configured")
        active_voice = voice_id or self._voice_id
        if active_voice not in VOICES:
            active_voice = self._voice_id
        if not text or not text.strip():
            return
        for chunk in self._split_text(text):
            payload = {
                "model_id": "sonic-2",
                "transcript": chunk,
                "voice": {"mode": "id", "id": active_voice},
                "output_format": {
                    "container": "raw",
                    "encoding": "pcm_s16le",
                    "sample_rate": self.sample_rate,
                },
                "language": "en",
            }
            response = await retry_post(
                self._client,
                CARTESIA_TTS_URL,
                headers={
                    "Authorization": f"Bearer {self._api_key}",
                    "Cartesia-Version": "2024-06-10",
                    "Content-Type": "application/json",
                },
                json=payload,
            )
            if response.status_code != 200:
                body = response.text[:500]
                logger.error("Cartesia TTS %s: %s", response.status_code, body)
                raise_for_tts_status(self.provider_name, response.status_code, body)

            yield response.content

    async def close(self) -> None:
        await self._client.aclose()
