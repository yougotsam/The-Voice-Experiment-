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
    {"id": "deepgram", "name": "Deepgram", "key_setting": "deepgram_api_key"},
    {"id": "cartesia", "name": "Cartesia", "key_setting": "cartesia_api_key"},
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
    return {"models": list_available_models(), "default": default_id}


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
    "deepgram": [
        {"id": "aura-2-thalia-en", "name": "Thalia"},
        {"id": "aura-2-andromeda-en", "name": "Andromeda"},
        {"id": "aura-2-athena-en", "name": "Athena"},
        {"id": "aura-2-luna-en", "name": "Luna"},
        {"id": "aura-2-stella-en", "name": "Stella"},
        {"id": "aura-2-apollo-en", "name": "Apollo"},
        {"id": "aura-2-arcas-en", "name": "Arcas"},
        {"id": "aura-2-helios-en", "name": "Helios"},
        {"id": "aura-2-orion-en", "name": "Orion"},
        {"id": "aura-2-perseus-en", "name": "Perseus"},
    ],
    "piper": [
        {"id": "hal", "name": "Hal"},
        {"id": "en_US-lessac-medium", "name": "Lessac"},
    ],
    "cartesia": [
        {"id": "79a125e8-cd45-4c13-8a67-188112f4dd22", "name": "British Lady"},
        {"id": "b7d50908-b17c-442d-ad8d-7c56e74dd5d8", "name": "California Girl"},
        {"id": "e3827ec5-697a-4b7c-9c55-5aad3dff5b00", "name": "Midwestern Woman"},
        {"id": "694f9389-aac1-45b6-b726-9d9369183238", "name": "Reflective Woman"},
        {"id": "f9836c6e-a0bd-460e-9d3c-f7299fa60f94", "name": "Storyteller Lady"},
        {"id": "87748186-23bb-4571-8b3d-237a4cfc67e5", "name": "Sweet Lady"},
        {"id": "a0e99841-438c-4a64-b679-ae501e7d6091", "name": "Barbershop Man"},
        {"id": "41534e16-2966-4c6b-9670-111411def906", "name": "Newsman"},
        {"id": "421b3369-f63f-4b03-8980-37a44df1d4e8", "name": "Southern Man"},
        {"id": "c8f432c7-6ab8-4962-8649-99078c0e5f7b", "name": "Confident Man"},
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
    elif provider_id == "deepgram":
        default = settings.deepgram_tts_voice
    elif provider_id == "cartesia":
        default = settings.cartesia_voice_id
    elif provider_id == "piper":
        configured = settings.piper_voice
        if any(v.get("id") == configured for v in voices):
            default = configured
        elif voices:
            default = voices[0].get("id", "")
    return {"voices": voices, "default": default}
