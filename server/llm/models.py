from __future__ import annotations

from dataclasses import dataclass

from server.config import settings


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
        name="Llama 3.3 70B (Groq)",
        provider="groq",
        model="llama-3.3-70b-versatile",
        base_url="https://api.groq.com/openai/v1",
        api_key_setting="llm_api_key",
    ),
    ModelConfig(
        id="groq-llama-8b",
        name="Llama 3.1 8B (Groq)",
        provider="groq",
        model="llama-3.1-8b-instant",
        base_url="https://api.groq.com/openai/v1",
        api_key_setting="llm_api_key",
    ),
    ModelConfig(
        id="gemini-flash",
        name="Gemini 2.5 Flash (Google)",
        provider="gemini",
        model="gemini-2.5-flash",
        base_url="https://generativelanguage.googleapis.com/v1beta/openai/",
        api_key_setting="gemini_api_key",
    ),
    ModelConfig(
        id="xai-grok-mini",
        name="Grok 3 Mini (xAI)",
        provider="xai",
        model="grok-3-mini-fast",
        base_url="https://api.x.ai/v1",
        api_key_setting="xai_api_key",
    ),
    ModelConfig(
        id="xai-grok-3",
        name="Grok 3 (xAI)",
        provider="xai",
        model="grok-3-fast",
        base_url="https://api.x.ai/v1",
        api_key_setting="xai_api_key",
    ),
    ModelConfig(
        id=f"ollama-{settings.ollama_model}",
        name=f"{settings.ollama_model} (Local)",
        provider="ollama",
        model=settings.ollama_model,
        base_url=settings.ollama_base_url,
        api_key_setting="ollama_api_key",
    ),
)


def get_model(model_id: str) -> ModelConfig | None:
    return MODEL_REGISTRY.get(model_id)


def list_available_models() -> list[dict[str, str]]:
    results = []
    for m in MODEL_REGISTRY.values():
        key = getattr(settings, m.api_key_setting, "")
        if key:
            results.append({"id": m.id, "name": m.name, "provider": m.provider})
    return results
