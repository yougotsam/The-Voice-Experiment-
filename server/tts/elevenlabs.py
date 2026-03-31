import asyncio
import json
import logging
import ssl
from typing import AsyncIterator

import certifi
import websockets
from websockets.asyncio.client import ClientConnection

from server.tts.base import TTSProvider

logger = logging.getLogger(__name__)

ELEVENLABS_WS_URL = "wss://api.elevenlabs.io/v1/text-to-speech/{voice_id}/stream-input"


class ElevenLabsTTS(TTSProvider):
    def __init__(self, api_key: str, voice_id: str):
        self._api_key = api_key
        self._voice_id = voice_id

    async def synthesize(self, text: str, voice_id: str = "") -> AsyncIterator[bytes]:
        if not self._api_key:
            raise RuntimeError("ElevenLabs API key not configured")
        active_voice = voice_id or self._voice_id
        url = ELEVENLABS_WS_URL.format(voice_id=active_voice)
        params = (
            f"?model_id=eleven_turbo_v2_5"
            f"&output_format=pcm_24000"
        )
        headers = {"xi-api-key": self._api_key}
        logger.debug("Connecting to ElevenLabs TTS: %s", url)

        ssl_ctx = ssl.create_default_context(cafile=certifi.where())
        async with websockets.connect(url + params, additional_headers=headers, ssl=ssl_ctx) as ws:
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

            async for raw in ws:
                msg = json.loads(raw)
                audio_b64 = msg.get("audio")
                if audio_b64:
                    import base64
                    yield base64.b64decode(audio_b64)
                if msg.get("isFinal"):
                    break
