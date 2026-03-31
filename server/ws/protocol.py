import json
from enum import Enum
from typing import Any


class ClientMessageType(str, Enum):
    CONFIG = "config"
    START = "start"
    STOP = "stop"
    INTERRUPT = "interrupt"
    PONG = "pong"
    TEXT = "text"


class ServerMessageType(str, Enum):
    TRANSCRIPT_PARTIAL = "transcript.partial"
    TRANSCRIPT_FINAL = "transcript.final"
    AGENT_TEXT = "agent.text"
    AGENT_AUDIO_START = "agent.audio.start"
    AGENT_AUDIO_END = "agent.audio.end"
    ERROR = "error"
    STATUS = "status"
    METRICS = "metrics"
    PING = "ping"
    TOOL_CALL_START = "tool_call.start"
    TOOL_CALL_RESULT = "tool_call.result"
    PERSONA_LOADED = "persona.loaded"
    MODEL_LOADED = "model.loaded"
    TTS_LOADED = "tts.loaded"
    ANALYTICS = "analytics"
    AGENT_ROUTED = "agent.routed"
    WEBHOOK_EVENT = "webhook.event"


def encode_message(msg_type: ServerMessageType, data: dict[str, Any] | None = None) -> str:
    payload: dict[str, Any] = {"type": msg_type.value}
    if data:
        payload.update(data)
    return json.dumps(payload)


def decode_message(raw: str) -> dict[str, Any]:
    return json.loads(raw)
