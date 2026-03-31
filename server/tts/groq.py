import io
import logging
import ssl
import wave
from typing import AsyncIterator

import certifi
import httpx

from server.tts.base import TTSProvider

logger = logging.getLogger(__name__)

GROQ_TTS_URL = "https://api.groq.com/openai/v1/audio/speech"


class GroqTTS(TTSProvider):
    sample_rate: int = 24000

    MAX_INPUT_CHARS = 180

    def __init__(self, api_key: str, voice: str = "troy", model: str = "canopylabs/orpheus-v1-english"):
        self._api_key = api_key
        self._voice = voice
        self._model = model
        ssl_ctx = ssl.create_default_context(cafile=certifi.where())
        self._client = httpx.AsyncClient(timeout=30.0, verify=ssl_ctx)
        logger.info("GroqTTS init: model=%s voice=%s key=%s", model, voice, "SET" if api_key else "MISSING")

    async def synthesize(self, text: str, voice_id: str = "") -> AsyncIterator[bytes]:
        if voice_id:
            logger.debug("Groq TTS does not support per-request voice_id, using default '%s'", self._voice)
        if not text or not text.strip():
            return
        for chunk in self._split_text(text):
            payload = {
                "model": self._model,
                "input": chunk,
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
                body = response.text[:500]
                logger.error("Groq TTS %s: %s", response.status_code, body)
                raise RuntimeError(f"Groq TTS HTTP {response.status_code}: {body}")

            wav_data = response.content
            with io.BytesIO(wav_data) as buf:
                with wave.open(buf, "rb") as wf:
                    self.sample_rate = wf.getframerate()
                    pcm_data = wf.readframes(wf.getnframes())
            yield pcm_data

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

    async def close(self) -> None:
        await self._client.aclose()
