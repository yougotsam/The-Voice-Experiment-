import os
import shutil
from pathlib import Path

from fastapi import APIRouter

from server.config import settings
from server.llm.models import list_available_models, MODEL_REGISTRY

router = APIRouter(prefix="/api/providers", tags=["providers"])

TTS_PROVIDERS = [
    {"id": "groq", "name": "Groq", "key_setting": "llm_api_key"},
    {"id": "xai", "name": "Grok Voice", "key_setting": "xai_api_key"},
    {"id": "grok-realtime", "name": "Grok Realtime", "key_setting": "xai_api_key"},
    {"id": "elevenlabs", "name": "ElevenLabs", "key_setting": "elevenlabs_api_key"},
    {"id": "piper", "name": "Piper", "key_setting": None},
]


def _is_piper_available() -> bool:
    if not shutil.which("piper"):
        return False
    models_dir = settings.piper_models_dir
    if not models_dir or not os.path.isdir(models_dir):
        return False
    return any(Path(models_dir).glob("*.onnx"))


@router.get("/models")
async def get_models():
    default_id = ""
    for m in MODEL_REGISTRY.values():
        if m.model == settings.llm_model and m.base_url == settings.llm_base_url:
            default_id = m.id
            break
    return {"models": await list_available_models(), "default": default_id}


@router.get("/tts")
async def get_tts_providers():
    available = []
    for p in TTS_PROVIDERS:
        key_setting = p["key_setting"]
        if key_setting is None:
            if p["id"] == "piper" and not _is_piper_available():
                continue
        elif not getattr(settings, key_setting, ""):
            continue
        available.append({"id": p["id"], "name": p["name"]})

    default = settings.tts_provider
    if default == "fallback":
        chain = [n.strip() for n in settings.tts_fallback_chain.split(",") if n.strip()]
        available_ids = {p["id"] for p in available}
        default = next((n for n in chain if n in available_ids), available[0]["id"] if available else "")

    return {"providers": available, "default": default}


VOICE_OPTIONS: dict[str, list[dict[str, str]]] = {
    "groq": [
        {"id": "autumn", "name": "Autumn"},
        {"id": "diana", "name": "Diana"},
        {"id": "hannah", "name": "Hannah"},
        {"id": "troy", "name": "Troy"},
        {"id": "austin", "name": "Austin"},
        {"id": "daniel", "name": "Daniel"},
    ],
    "xai": [
        {"id": "eve", "name": "Eve"},
        {"id": "ara", "name": "Ara"},
        {"id": "rex", "name": "Rex"},
        {"id": "sal", "name": "Sal"},
        {"id": "leo", "name": "Leo"},
    ],
    "elevenlabs": [
        {"id": "JBFqnCBsd6RMkjVDRZzb", "name": "George"},
        {"id": "EXAVITQu4vr4xnSDxMaL", "name": "Sarah"},
        {"id": "pFZP5JQG7iQjIQuC4Bku", "name": "Lily"},
        {"id": "TX3LPaxmHKxFdv7VOQHJ", "name": "Liam"},
        {"id": "XB0fDUnXU5powFXDhCwa", "name": "Charlotte"},
        {"id": "pqHfZKP75CvOlQylNhV4", "name": "Bill"},
        {"id": "nPczCjzI2devNBz1zQrb", "name": "Brian"},
        {"id": "bIHbv24MWmeRgasZH58o", "name": "Will"},
    ],
    "piper": [
        {"id": "hal", "name": "Hal"},
        {"id": "en_US-lessac-medium", "name": "Lessac"},
    ],
}


@router.get("/voices/{provider_id}")
async def get_voices(provider_id: str):
    voices = VOICE_OPTIONS.get(provider_id, [])
    default = ""
    if provider_id == "groq":
        default = settings.groq_tts_voice
    elif provider_id in ("xai", "grok-realtime"):
        default = settings.xai_tts_voice
        if not voices:
            voices = VOICE_OPTIONS.get("xai", [])
    elif provider_id == "elevenlabs":
        default = settings.elevenlabs_voice_id
    elif provider_id == "piper":
        configured = settings.piper_voice
        if any(v.get("id") == configured for v in voices):
            default = configured
        elif voices:
            default = voices[0].get("id", "")
    return {"voices": voices, "default": default}
