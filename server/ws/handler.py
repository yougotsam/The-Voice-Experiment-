import asyncio
import json
import logging
import uuid

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from server.config import settings
from server.ws.protocol import (
    ClientMessageType,
    ServerMessageType,
    decode_message,
    encode_message,
)
from server.stt.assemblyai import AssemblyAISTT
from server.llm.openai_compat import OpenAICompatLLM
from server.tts.elevenlabs import ElevenLabsTTS
from server.pipeline.orchestrator import Orchestrator
from server.pipeline.session import ConversationSession
from server.tools.base import ToolRegistry
from server.tools.ghl import GHLContactSearch

logger = logging.getLogger(__name__)
router = APIRouter()

MAX_TEXT_LENGTH = 2000
MAX_SYSTEM_PROMPT_LENGTH = 2000


def _create_single_tts(provider: str):
    if provider == "groq":
        from server.tts.groq import GroqTTS
        return GroqTTS(settings.llm_api_key, settings.groq_tts_voice, settings.groq_tts_model)
    if provider == "dia2":
        from server.tts.dia2 import Dia2TTS
        return Dia2TTS()
    if provider == "csm":
        from server.tts.csm import CSMTTS
        return CSMTTS()
    if provider == "piper":
        from server.tts.piper import PiperTTS
        return PiperTTS()
    return ElevenLabsTTS(settings.elevenlabs_api_key, settings.elevenlabs_voice_id)


def _create_tts():
    provider = settings.tts_provider

    if provider == "fallback":
        from server.tts.fallback import FallbackTTS
        chain = []
        for name in settings.tts_fallback_chain.split(","):
            name = name.strip()
            if not name:
                continue
            try:
                chain.append(_create_single_tts(name))
            except Exception:
                logger.warning("TTS provider '%s' not available, skipping", name, exc_info=True)
        return FallbackTTS(chain) if chain else _create_single_tts("elevenlabs")

    return _create_single_tts(provider)


@router.websocket("/ws")
async def websocket_endpoint(ws: WebSocket) -> None:
    await ws.accept()
    session_id = str(uuid.uuid4())
    logger.info("WS connected: %s", session_id)

    orchestrator: Orchestrator | None = None
    ping_task: asyncio.Task | None = None
    try:
        session = ConversationSession(session_id)
        stt = AssemblyAISTT(settings.assemblyai_api_key)
        llm = OpenAICompatLLM(settings.llm_api_key, settings.llm_base_url, settings.llm_model)
        tts = _create_tts()

        async def send_json(msg_type: str, data: dict) -> None:
            await ws.send_text(encode_message(ServerMessageType(msg_type), data))

        async def send_audio(audio: bytes) -> None:
            await ws.send_bytes(audio)

        async def send_status(status: str) -> None:
            await ws.send_text(encode_message(ServerMessageType.STATUS, {"status": status}))

        tool_registry = ToolRegistry()
        if settings.ghl_api_key and settings.ghl_location_id:
            tool_registry.register(GHLContactSearch())
            logger.info("GHL tools enabled for session %s", session_id)

        orchestrator = Orchestrator(stt, llm, tts, session, send_json, send_audio, send_status, tool_registry)

        async def _ping_loop():
            try:
                while True:
                    await asyncio.sleep(25)
                    await ws.send_text(encode_message(ServerMessageType.PING, {}))
            except (WebSocketDisconnect, Exception):
                return

        ping_task = asyncio.create_task(_ping_loop())

        while True:
            data = await ws.receive()

            if "bytes" in data and data["bytes"]:
                await orchestrator.feed_audio(data["bytes"])
            elif "text" in data and data["text"]:
                try:
                    msg = decode_message(data["text"])
                except (json.JSONDecodeError, ValueError):
                    logger.warning("Malformed JSON from client, ignoring")
                    continue
                msg_type = msg.get("type", "")

                if msg_type == ClientMessageType.PONG:
                    continue
                elif msg_type == ClientMessageType.START:
                    try:
                        await orchestrator.start_listening()
                    except Exception:
                        logger.exception("Failed to start listening")
                        await send_json("error", {"text": "Failed to connect to speech recognition service."})
                        await send_status("idle")
                elif msg_type == ClientMessageType.STOP:
                    await orchestrator.stop_listening()
                elif msg_type == ClientMessageType.INTERRUPT:
                    await orchestrator.interrupt()
                elif msg_type == ClientMessageType.TEXT:
                    text = msg.get("text", "").strip()[:MAX_TEXT_LENGTH]
                    if text:
                        await orchestrator.process_text_input(text)
                elif msg_type == ClientMessageType.CONFIG:
                    system_prompt = msg.get("system_prompt", "")[:MAX_SYSTEM_PROMPT_LENGTH]
                    session.set_persona(system_prompt)

    except WebSocketDisconnect:
        logger.info("WS disconnected: %s", session_id)
    except Exception:
        logger.exception("WS error: %s", session_id)
    finally:
        if ping_task:
            ping_task.cancel()
        if orchestrator:
            await orchestrator.shutdown()
