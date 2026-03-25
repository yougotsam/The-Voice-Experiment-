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

logger = logging.getLogger(__name__)
router = APIRouter()


def _create_tts():
    provider = settings.tts_provider

    if provider == "csm":
        from server.tts.csm import CSMTTS
        return CSMTTS()

    if provider == "piper":
        from server.tts.piper import PiperTTS
        return PiperTTS()

    return ElevenLabsTTS(settings.elevenlabs_api_key, settings.elevenlabs_voice_id)


@router.websocket("/ws")
async def websocket_endpoint(ws: WebSocket) -> None:
    await ws.accept()
    session_id = str(uuid.uuid4())
    logger.info("WS connected: %s", session_id)

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

    orchestrator = Orchestrator(stt, llm, tts, session, send_json, send_audio, send_status)

    try:
        while True:
            data = await ws.receive()

            if "bytes" in data and data["bytes"]:
                await orchestrator.feed_audio(data["bytes"])
            elif "text" in data and data["text"]:
                msg = decode_message(data["text"])
                msg_type = msg.get("type", "")

                if msg_type == ClientMessageType.START:
                    await orchestrator.start_listening()
                elif msg_type == ClientMessageType.STOP:
                    await orchestrator.stop_listening()

    except WebSocketDisconnect:
        logger.info("WS disconnected: %s", session_id)
    except Exception:
        logger.exception("WS error: %s", session_id)
    finally:
        await orchestrator.shutdown()
