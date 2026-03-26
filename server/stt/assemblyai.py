import asyncio
import json
import logging
from typing import Callable, Awaitable

import websockets
from websockets.asyncio.client import ClientConnection

from server.stt.base import STTProvider

logger = logging.getLogger(__name__)

ASSEMBLYAI_URL = "wss://streaming.assemblyai.com/v3/ws"
SAMPLE_RATE = 16000
SPEECH_MODEL = "u3-rt-pro"


class AssemblyAISTT(STTProvider):
    def __init__(self, api_key: str):
        self._api_key = api_key
        self._ws: ClientConnection | None = None
        self._recv_task: asyncio.Task | None = None
        self._got_final = asyncio.Event()
        self._audio_chunks_sent = 0

    async def start(
        self,
        on_partial: Callable[[str], Awaitable[None]],
        on_final: Callable[[str], Awaitable[None]],
    ) -> None:
        self._got_final.clear()
        self._audio_chunks_sent = 0
        url = f"{ASSEMBLYAI_URL}?sample_rate={SAMPLE_RATE}&speech_model={SPEECH_MODEL}"
        extra_headers = {
            "Authorization": self._api_key,
            "AssemblyAI-Version": "2025-05-12",
        }
        self._ws = await websockets.connect(url, additional_headers=extra_headers)

        session_msg = await self._ws.recv()
        session_data = json.loads(session_msg)
        logger.info("AssemblyAI v3 session started: %s", session_data.get("id"))

        self._recv_task = asyncio.create_task(
            self._receive_loop(on_partial, on_final)
        )

    async def _receive_loop(
        self,
        on_partial: Callable[[str], Awaitable[None]],
        on_final: Callable[[str], Awaitable[None]],
    ) -> None:
        assert self._ws is not None
        try:
            async for raw in self._ws:
                msg = json.loads(raw)
                msg_type = msg.get("type")
                logger.debug("AssemblyAI recv: type=%s data=%s", msg_type, str(raw)[:200])
                transcript = msg.get("transcript", "")
                if msg_type == "Turn":
                    logger.info("Turn event: end_of_turn=%s transcript='%s'", msg.get("end_of_turn"), transcript[:100])
                    if msg.get("end_of_turn"):
                        if transcript:
                            await on_final(transcript)
                        self._got_final.set()
                    elif transcript:
                        await on_partial(transcript)
        except websockets.ConnectionClosed:
            logger.info("AssemblyAI connection closed")
        except Exception:
            logger.exception("AssemblyAI receive error")
        finally:
            self._got_final.set()
            self._ws = None

    async def send_audio(self, audio: bytes) -> None:
        if self._ws is None:
            return
        try:
            await self._ws.send(audio)
            self._audio_chunks_sent += 1
            if self._audio_chunks_sent % 50 == 1:
                logger.info("Audio chunk sent #%d (%d bytes)", self._audio_chunks_sent, len(audio))
        except Exception:
            logger.warning("AssemblyAI send failed, connection lost")
            self._ws = None

    async def force_flush(self) -> None:
        if self._ws is None:
            return
        try:
            self._got_final.clear()
            await self._ws.send(json.dumps({"type": "ForceEndpoint"}))
            await asyncio.wait_for(self._got_final.wait(), timeout=5.0)
        except asyncio.TimeoutError:
            logger.warning("Timed out waiting for final transcript after ForceEndpoint")
        except Exception:
            logger.warning("ForceEndpoint failed")

    async def stop(self) -> None:
        if self._ws:
            try:
                await self._ws.send(json.dumps({"type": "Terminate"}))
                await self._ws.close()
            except Exception:
                pass
            self._ws = None
        if self._recv_task:
            self._recv_task.cancel()
            try:
                await self._recv_task
            except asyncio.CancelledError:
                pass
            self._recv_task = None
