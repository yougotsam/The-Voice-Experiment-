import io
import logging
import wave
from typing import AsyncIterator

import httpx

from server.tts.base import TTSProvider

logger = logging.getLogger(__name__)

GROQ_TTS_URL = "https://api.groq.com/openai/v1/audio/speech"


class GroqTTS(TTSProvider):
    sample_rate: int = 24000

    def __init__(self, api_key: str, voice: str = "Fritz-PlayAI", model: str = "playai-tts"):
        self._api_key = api_key
        self._voice = voice
        self._model = model
        self._client = httpx.AsyncClient(timeout=30.0)

    async def synthesize(self, text: str, voice_id: str = "") -> AsyncIterator[bytes]:
        payload = {
            "model": self._model,
            "input": text,
            "voice": self._voice,
            "response_format": "wav",
        }
        response = await self._client.post(
            GROQ_TTS_URL,
            headers={
                "Authorization": f"Bearer {self._api_key}",
                "Content-Type": "application/json",
            },
            json=payload,
        )
        if response.status_code != 200:
            logger.error("Groq TTS %s: %s", response.status_code, response.text[:500])
            response.raise_for_status()

        wav_data = response.content
        with io.BytesIO(wav_data) as buf:
            with wave.open(buf, "rb") as wf:
                self.sample_rate = wf.getframerate()
                pcm_data = wf.readframes(wf.getnframes())
        yield pcm_data

    async def close(self) -> None:
        await self._client.aclose()
