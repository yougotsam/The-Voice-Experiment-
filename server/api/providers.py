from fastapi import APIRouter

from server.config import settings
from server.llm.models import list_available_models, MODEL_REGISTRY

router = APIRouter(prefix="/api/providers", tags=["providers"])

TTS_PROVIDERS = [
    {"id": "groq", "name": "Groq (PlayAI)", "key_setting": "llm_api_key"},
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
    return {"providers": available, "default": settings.tts_provider}
