from fastapi import APIRouter

from server.config import settings
from server.llm.models import list_available_models, MODEL_REGISTRY

router = APIRouter(prefix="/api/providers", tags=["providers"])

TTS_PROVIDERS = [
    {"id": "groq", "name": "Groq (Orpheus)", "key_setting": "llm_api_key"},
    {"id": "xai", "name": "xAI", "key_setting": "xai_api_key"},
    {"id": "elevenlabs", "name": "ElevenLabs", "key_setting": "elevenlabs_api_key"},
    {"id": "piper", "name": "Piper (Local)", "key_setting": None},
]


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
        if key_setting is None or getattr(settings, key_setting, ""):
            available.append({"id": p["id"], "name": p["name"]})

    default = settings.tts_provider
    if default == "fallback":
        chain = [n.strip() for n in settings.tts_fallback_chain.split(",") if n.strip()]
        available_ids = {p["id"] for p in available}
        default = next((n for n in chain if n in available_ids), available[0]["id"] if available else "")

    return {"providers": available, "default": default}


VOICE_OPTIONS: dict[str, list[dict[str, str]]] = {
    "groq": [
        {"id": "autumn", "name": "Autumn (Female)"},
        {"id": "diana", "name": "Diana (Female)"},
        {"id": "hannah", "name": "Hannah (Female)"},
        {"id": "troy", "name": "Troy (Male)"},
        {"id": "austin", "name": "Austin (Male)"},
        {"id": "daniel", "name": "Daniel (Male)"},
    ],
    "xai": [
        {"id": "eve", "name": "Eve (Energetic)"},
        {"id": "ara", "name": "Ara (Warm)"},
        {"id": "rex", "name": "Rex (Confident)"},
        {"id": "sal", "name": "Sal (Balanced)"},
        {"id": "leo", "name": "Leo (Authoritative)"},
    ],
    "piper": [
        {"id": "en_US-lessac-medium", "name": "Lessac (Default)"},
    ],
}


@router.get("/voices/{provider_id}")
async def get_voices(provider_id: str):
    voices = VOICE_OPTIONS.get(provider_id, [])
    default = ""
    if provider_id == "groq":
        default = settings.groq_tts_voice
    elif provider_id == "xai":
        default = settings.xai_tts_voice
    elif provider_id == "elevenlabs":
        default = settings.elevenlabs_voice_id
        voices = [{"id": default, "name": "Default Voice"}]
    elif provider_id == "piper":
        default = "en_US-lessac-medium"
    return {"voices": voices, "default": default}
