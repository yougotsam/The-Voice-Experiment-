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
from server.llm.models import get_model, MODEL_REGISTRY
from server.tts.elevenlabs import ElevenLabsTTS
from server.pipeline.orchestrator import Orchestrator
from server.pipeline.session import ConversationSession
from server.pipeline.metrics import SessionMetrics
from server.agents.router import AgentRouter
from server.tools.base import ToolRegistry
from server.ws.connections import manager as ws_manager
from server.tools.ghl import (
    GHLContactSearch,
    GHLCreateContact,
    GHLCreateOpportunity,
    GHLDraftContent,
    GHLGetCalendarEvents,
    GHLGetConversations,
    GHLGetPipelines,
    GHLMoveOpportunity,
    GHLSendEmail,
    GHLSendSMS,
)

logger = logging.getLogger(__name__)
router = APIRouter()

MAX_TEXT_LENGTH = 2000
VALID_TTS_PROVIDERS = {"groq", "elevenlabs", "piper", "dia2", "csm"}


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
        tool_registry.register(GHLDraftContent())
        if settings.ghl_api_key and settings.ghl_location_id:
            tool_registry.register(GHLContactSearch())
            tool_registry.register(GHLCreateContact())
            tool_registry.register(GHLGetCalendarEvents())
            tool_registry.register(GHLGetPipelines())
            tool_registry.register(GHLCreateOpportunity())
            tool_registry.register(GHLMoveOpportunity())
            tool_registry.register(GHLSendSMS())
            tool_registry.register(GHLSendEmail())
            tool_registry.register(GHLGetConversations())
            logger.info("GHL tools enabled (%d tools) for session %s", len(tool_registry), session_id)

        session_metrics = SessionMetrics(session_id)
        agent_router = AgentRouter()
        orchestrator = Orchestrator(stt, llm, tts, session, send_json, send_audio, send_status, tool_registry, metrics=session_metrics, router=agent_router)

        async def _ping_loop():
            try:
                while True:
                    await asyncio.sleep(25)
                    await ws.send_text(encode_message(ServerMessageType.PING, {}))
            except (WebSocketDisconnect, Exception):
                return

        ws_manager.register(session_id, send_json)
        ping_task = asyncio.create_task(_ping_loop())

        default_model_id = ""
        for m in MODEL_REGISTRY.values():
            if m.model == settings.llm_model and m.base_url == settings.llm_base_url:
                default_model_id = m.id
                break
        default_tts = settings.tts_provider
        if default_tts == "fallback":
            tts_key_map = {"groq": "llm_api_key", "elevenlabs": "elevenlabs_api_key"}
            chain = [n.strip() for n in settings.tts_fallback_chain.split(",") if n.strip()]
            default_tts = next(
                (n for n in chain if tts_key_map.get(n) is None or getattr(settings, tts_key_map.get(n, ""), "")),
                chain[0] if chain else "groq",
            )
        await send_json(ServerMessageType.CONFIG_CURRENT.value, {"model_id": default_model_id, "tts_provider": default_tts})

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
                    persona_id = msg.get("persona_id")
                    model_id = msg.get("model_id")
                    tts_provider_id = msg.get("tts_provider")

                    if persona_id:
                        if orchestrator:
                            await orchestrator.interrupt()
                        session.set_persona(persona_id)
                        session_metrics.record_persona(persona_id)
                        await send_json(ServerMessageType.PERSONA_LOADED.value, {
                            "persona_id": session.persona.id,
                            "name": session.persona.name,
                            "greeting": session.persona.greeting,
                        })
                        await send_status("idle")

                    if model_id:
                        model_cfg = get_model(model_id)
                        if not model_cfg:
                            await send_json("error", {"text": f"Unknown model: {model_id}"})
                        else:
                            api_key = getattr(settings, model_cfg.api_key_setting, "")
                            if api_key:
                                llm.set_model(model_cfg.model, model_cfg.base_url, api_key)
                                session_metrics.record_model(model_cfg.id)
                                await send_json(ServerMessageType.MODEL_LOADED.value, {
                                    "model_id": model_cfg.id,
                                    "name": model_cfg.name,
                                })
                                logger.info("Model switched to %s for session %s", model_cfg.id, session_id)
                            else:
                                await send_json("error", {"text": f"API key not configured for {model_cfg.provider}"})

                    if tts_provider_id:
                        if tts_provider_id not in VALID_TTS_PROVIDERS:
                            await send_json("error", {"text": f"Unknown TTS provider: {tts_provider_id}"})
                        else:
                            try:
                                primary = _create_single_tts(tts_provider_id)
                                fallback_names = [n.strip() for n in settings.tts_fallback_chain.split(",") if n.strip()]
                                others = []
                                for name in fallback_names:
                                    if name != tts_provider_id:
                                        try:
                                            others.append(_create_single_tts(name))
                                        except Exception:
                                            logger.info("Fallback TTS provider '%s' not available, skipping", name, exc_info=True)
                                if others:
                                    from server.tts.fallback import FallbackTTS
                                    new_tts = FallbackTTS([primary] + others)
                                else:
                                    new_tts = primary
                                if orchestrator:
                                    await orchestrator.set_tts(new_tts)
                                tts = new_tts
                                await send_json(ServerMessageType.TTS_LOADED.value, {
                                    "provider": tts_provider_id,
                                })
                                logger.info("TTS switched to %s (with %d fallbacks) for session %s", tts_provider_id, len(others), session_id)
                            except Exception:
                                logger.exception("Failed to switch TTS to %s", tts_provider_id)
                                await send_json("error", {"text": f"Failed to load TTS provider: {tts_provider_id}"})

                    voice_id = msg.get("voice_id")
                    if voice_id and isinstance(voice_id, str):
                        active_tts = tts
                        if hasattr(active_tts, '_providers'):
                            active_tts = active_tts._providers[0]
                        if hasattr(active_tts, 'set_voice'):
                            active_tts.set_voice(voice_id)
                            await send_json("voice.loaded", {"voice_id": voice_id})
                            logger.info("Voice changed to %s for session %s", voice_id, session_id)

    except WebSocketDisconnect:
        logger.info("WS disconnected: %s", session_id)
    except RuntimeError as exc:
        if str(exc) == 'Cannot call "receive" once a disconnect message has been received.':
            logger.info("WS disconnected (runtime): %s", session_id)
        else:
            raise
    except Exception:
        logger.exception("WS error: %s", session_id)
    finally:
        ws_manager.unregister(session_id)
        if ping_task:
            ping_task.cancel()
        if orchestrator:
            await orchestrator.shutdown()
