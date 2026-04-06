from __future__ import annotations

import logging
from dataclasses import dataclass

import httpx

from server.config import settings

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class ModelConfig:
    id: str
    name: str
    provider: str
    model: str
    base_url: str
    api_key_setting: str
    max_tokens: int = 1024


MODEL_REGISTRY: dict[str, ModelConfig] = {}


def _register(*models: ModelConfig) -> None:
    for m in models:
        MODEL_REGISTRY[m.id] = m


_register(
    ModelConfig(
        id="groq-llama-70b",
        name="Llama 70B",
        provider="groq",
        model="llama-3.3-70b-versatile",
        base_url="https://api.groq.com/openai/v1",
        api_key_setting="llm_api_key",
    ),
    ModelConfig(
        id="groq-llama-8b",
        name="Llama 8B Fast",
        provider="groq",
        model="llama-3.1-8b-instant",
        base_url="https://api.groq.com/openai/v1",
        api_key_setting="llm_api_key",
    ),
    ModelConfig(
        id="gemini-flash",
        name="Gemini Flash",
        provider="gemini",
        model="gemini-2.5-flash",
        base_url="https://generativelanguage.googleapis.com/v1beta/openai/",
        api_key_setting="gemini_api_key",
    ),
    ModelConfig(
        id="xai-grok-mini",
        name="Grok Mini",
        provider="xai",
        model="grok-3-mini-fast",
        base_url="https://api.x.ai/v1",
        api_key_setting="xai_api_key",
    ),
    ModelConfig(
        id="xai-grok-3",
        name="Grok 3",
        provider="xai",
        model="grok-3-fast",
        base_url="https://api.x.ai/v1",
        api_key_setting="xai_api_key",
    ),
    ModelConfig(
        id=f"ollama-{settings.ollama_model}",
        name=f"{settings.ollama_model.split(':')[0].capitalize()} Local",
        provider="ollama",
        model=settings.ollama_model,
        base_url=settings.ollama_base_url,
        api_key_setting="ollama_api_key",
    ),
)


def get_model(model_id: str) -> ModelConfig | None:
    return MODEL_REGISTRY.get(model_id)


async def list_available_models() -> list[dict[str, str]]:
    results = []
    for m in MODEL_REGISTRY.values():
        key = getattr(settings, m.api_key_setting, "")
        if not key:
            continue
        if m.provider == "ollama" and not await _ollama_reachable_async(m.base_url):
            continue
        results.append({"id": m.id, "name": m.name, "provider": m.provider})
    return results


def _ollama_reachable(base_url: str) -> bool:
    health_url = base_url.replace("/v1", "")
    try:
        resp = httpx.get(health_url, timeout=2.0)
        return resp.status_code == 200
    except Exception:
        logger.debug("Ollama not reachable at %s", health_url)
        return False


async def _ollama_reachable_async(base_url: str) -> bool:
    health_url = base_url.replace("/v1", "")
    try:
        async with httpx.AsyncClient(timeout=2.0) as client:
            resp = await client.get(health_url)
            return resp.status_code == 200
    except Exception:
        logger.debug("Ollama not reachable at %s", health_url)
        return False
