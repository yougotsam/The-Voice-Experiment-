import asyncio
import base64
import json
import logging
import ssl
from typing import AsyncIterator

import certifi
import websockets

from server.tts.base import TTSProvider

logger = logging.getLogger(__name__)

ELEVENLABS_WS_URL = "wss://api.elevenlabs.io/v1/text-to-speech/{voice_id}/stream-input"

KNOWN_VOICES = {
    "JBFqnCBsd6RMkjVDRZzb",
    "EXAVITQu4vr4xnSDxMaL",
    "pFZP5JQG7iQjIQuC4Bku",
    "TX3LPaxmHKxFdv7VOQHJ",
    "XB0fDUnXU5powFXDhCwa",
    "pqHfZKP75CvOlQylNhV4",
    "nPczCjzI2devNBz1zQrb",
    "bIHbv24MWmeRgasZH58o",
}

WS_TIMEOUT = 15


class ElevenLabsTTS(TTSProvider):
    def __init__(self, api_key: str, voice_id: str):
        self._api_key = api_key
        self._voice_id = voice_id
        logger.info("ElevenLabsTTS init: voice=%s key=%s", voice_id, "SET" if api_key else "MISSING")

    def set_voice(self, voice: str) -> bool:
        if KNOWN_VOICES and voice not in KNOWN_VOICES:
            logger.warning("Unknown ElevenLabs voice '%s', keeping '%s'", voice, self._voice_id)
            return False
        self._voice_id = voice
        logger.info("ElevenLabs TTS voice changed to '%s'", voice)
        return True

    async def synthesize(self, text: str, voice_id: str = "") -> AsyncIterator[bytes]:
        if not self._api_key:
            raise RuntimeError("ElevenLabs API key not configured")
        if not text or not text.strip():
            return
        active_voice = voice_id or self._voice_id
        url = ELEVENLABS_WS_URL.format(voice_id=active_voice)
        params = "?model_id=eleven_multilingual_v2&output_format=pcm_24000"
        headers = {"xi-api-key": self._api_key}
        logger.info("ElevenLabs TTS: connecting for %d chars, voice=%s", len(text), active_voice)

        ssl_ctx = ssl.create_default_context(cafile=certifi.where())
        try:
            async with websockets.connect(
                url + params,
                additional_headers=headers,
                ssl=ssl_ctx,
                open_timeout=WS_TIMEOUT,
                close_timeout=WS_TIMEOUT,
            ) as ws:
                bos = {
                    "text": " ",
                    "voice_settings": {
                        "stability": 0.5,
                        "similarity_boost": 0.75,
                    },
                    "generation_config": {"chunk_length_schedule": [120]},
                }
                await ws.send(json.dumps(bos))
                await ws.send(json.dumps({"text": text}))
                await ws.send(json.dumps({"text": ""}))

                chunk_count = 0
                async for raw in ws:
                    try:
                        msg = json.loads(raw)
                    except json.JSONDecodeError:
                        logger.warning("ElevenLabs: non-JSON message received")
                        continue
                    if msg.get("error"):
                        logger.error("ElevenLabs API error: %s", msg["error"])
                        raise RuntimeError(f"ElevenLabs error: {msg['error']}")
                    audio_b64 = msg.get("audio")
                    if audio_b64:
                        chunk_count += 1
                        yield base64.b64decode(audio_b64)
                    if msg.get("isFinal"):
                        break
                logger.info("ElevenLabs TTS: sent %d audio chunks", chunk_count)
        except websockets.exceptions.InvalidStatusCode as exc:
            logger.error("ElevenLabs WS rejected: HTTP %s", exc.status_code)
            raise RuntimeError(f"ElevenLabs rejected connection (HTTP {exc.status_code}) — check your API key")
        except (OSError, asyncio.TimeoutError) as exc:
            logger.error("ElevenLabs connection failed: %s", exc)
            raise RuntimeError(f"ElevenLabs connection failed: {exc}")
