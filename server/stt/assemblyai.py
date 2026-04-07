import asyncio
import base64
import json
import logging
import ssl
from typing import Callable, Awaitable

import certifi
import websockets
from websockets.asyncio.client import ClientConnection

from server.stt.base import STTProvider

logger = logging.getLogger(__name__)

ASSEMBLYAI_V3_URL = "wss://streaming.assemblyai.com/v3/ws"
ASSEMBLYAI_V2_URL = "wss://streaming.assemblyai.com/v2/realtime/ws"
SAMPLE_RATE = 16000
SPEECH_MODEL = "u3-rt-pro"


class AssemblyAISTT(STTProvider):
    def __init__(self, api_key: str):
        self._api_key = api_key
        self._ws: ClientConnection | None = None
        self._recv_task: asyncio.Task | None = None
        self._got_final = asyncio.Event()
        self._audio_chunks_sent = 0
        self._using_v3 = False

    async def start(
        self,
        on_partial: Callable[[str], Awaitable[None]],
        on_final: Callable[[str], Awaitable[None]],
    ) -> None:
        self._got_final.clear()
        self._audio_chunks_sent = 0
        ssl_ctx = ssl.create_default_context(cafile=certifi.where())

        try:
            self._ws = await self._connect_v3(ssl_ctx)
            self._using_v3 = True
            session_msg = await self._ws.recv()
            session_data = json.loads(session_msg)
            logger.info("AssemblyAI v3 session started: %s", session_data.get("id"))
        except Exception as v3_err:
            logger.warning("AssemblyAI v3 failed (%s), falling back to v2", v3_err)
            if self._ws:
                try:
                    await self._ws.close()
                except Exception:
                    pass
                self._ws = None
            self._using_v3 = False
            try:
                self._ws = await self._connect_v2(ssl_ctx)
                session_msg = await self._ws.recv()
                session_data = json.loads(session_msg)
                logger.info("AssemblyAI v2 session started: %s", session_data.get("session_id"))
            except Exception:
                logger.exception("AssemblyAI v2 also failed")
                raise

        self._recv_task = asyncio.create_task(
            self._receive_loop(on_partial, on_final)
        )

    async def _connect_v3(self, ssl_ctx: ssl.SSLContext) -> ClientConnection:
        url = f"{ASSEMBLYAI_V3_URL}?sample_rate={SAMPLE_RATE}&speech_model={SPEECH_MODEL}"
        extra_headers = {
            "Authorization": self._api_key,
            "AssemblyAI-Version": "2025-05-12",
        }
        return await websockets.connect(url, additional_headers=extra_headers, ssl=ssl_ctx)

    async def _connect_v2(self, ssl_ctx: ssl.SSLContext) -> ClientConnection:
        url = f"{ASSEMBLYAI_V2_URL}?sample_rate={SAMPLE_RATE}"
        extra_headers = {"Authorization": self._api_key}
        return await websockets.connect(url, additional_headers=extra_headers, ssl=ssl_ctx)

    async def _receive_loop(
        self,
        on_partial: Callable[[str], Awaitable[None]],
        on_final: Callable[[str], Awaitable[None]],
    ) -> None:
        assert self._ws is not None
        try:
            async for raw in self._ws:
                msg = json.loads(raw)
                if self._using_v3:
                    await self._handle_v3_message(msg, on_partial, on_final)
                else:
                    await self._handle_v2_message(msg, on_partial, on_final)
        except websockets.ConnectionClosed:
            logger.info("AssemblyAI connection closed")
        except Exception:
            logger.exception("AssemblyAI receive error")
        finally:
            self._got_final.set()
            self._ws = None

    async def _handle_v3_message(self, msg: dict, on_partial, on_final) -> None:
        msg_type = msg.get("type")
        transcript = msg.get("transcript", "")
        if msg_type == "Turn":
            if msg.get("end_of_turn"):
                if transcript:
                    await on_final(transcript)
                self._got_final.set()
            elif transcript:
                await on_partial(transcript)

    async def _handle_v2_message(self, msg: dict, on_partial, on_final) -> None:
        msg_type = msg.get("message_type")
        text = msg.get("text", "")
        if not text:
            return
        if msg_type == "PartialTranscript":
            await on_partial(text)
        elif msg_type == "FinalTranscript":
            await on_final(text)
            self._got_final.set()

    async def send_audio(self, audio: bytes) -> None:
        if self._ws is None:
            return
        try:
            if self._using_v3:
                await self._ws.send(audio)
            else:
                encoded = base64.b64encode(audio).decode("utf-8")
                await self._ws.send(json.dumps({"audio_data": encoded}))
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
            if self._using_v3:
                await self._ws.send(json.dumps({"type": "ForceEndpoint"}))
            else:
                await self._ws.send(json.dumps({"force_endpoint": True}))
            await asyncio.wait_for(self._got_final.wait(), timeout=5.0)
        except asyncio.TimeoutError:
            logger.warning("Timed out waiting for final transcript after ForceEndpoint")
        except Exception:
            logger.warning("ForceEndpoint failed")

    async def stop(self) -> None:
        if self._ws:
            try:
                if self._using_v3:
                    await self._ws.send(json.dumps({"type": "Terminate"}))
                else:
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
