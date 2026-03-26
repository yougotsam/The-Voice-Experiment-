import asyncio
import base64
import json
import logging
from typing import Callable, Awaitable

import websockets
from websockets.asyncio.client import ClientConnection

from server.stt.base import STTProvider

logger = logging.getLogger(__name__)

ASSEMBLYAI_RT_URL = "wss://streaming.assemblyai.com/v2/realtime/ws"
SAMPLE_RATE = 16000


class AssemblyAISTT(STTProvider):
    def __init__(self, api_key: str):
        self._api_key = api_key
        self._ws: ClientConnection | None = None
        self._recv_task: asyncio.Task | None = None

    async def start(
        self,
        on_partial: Callable[[str], Awaitable[None]],
        on_final: Callable[[str], Awaitable[None]],
    ) -> None:
        url = f"{ASSEMBLYAI_RT_URL}?sample_rate={SAMPLE_RATE}&token={self._api_key}"
        self._ws = await websockets.connect(url)

        session_msg = await self._ws.recv()
        session_data = json.loads(session_msg)
        logger.info("AssemblyAI session started: %s", session_data.get("session_id"))

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
                msg_type = msg.get("message_type")
                text = msg.get("text", "")
                if not text:
                    continue
                if msg_type == "PartialTranscript":
                    await on_partial(text)
                elif msg_type == "FinalTranscript":
                    await on_final(text)
        except websockets.ConnectionClosed:
            logger.info("AssemblyAI connection closed")
        except Exception:
            logger.exception("AssemblyAI receive error")
        finally:
            self._ws = None

    async def send_audio(self, audio: bytes) -> None:
        if self._ws is None:
            return
        try:
            encoded = base64.b64encode(audio).decode("utf-8")
            await self._ws.send(json.dumps({"audio_data": encoded}))
        except Exception:
            logger.warning("AssemblyAI send failed, connection lost")
            self._ws = None

    async def stop(self) -> None:
        if self._ws:
            try:
                await self._ws.send(json.dumps({"terminate_session": True}))
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
