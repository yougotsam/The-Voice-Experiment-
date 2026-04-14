import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from contextlib import asynccontextmanager

from server.config import settings
from server.middleware.security import SecurityHeadersMiddleware, RateLimitMiddleware
from server.ws.handler import router as ws_router
from server.api.crm import router as crm_router
from server.api.providers import router as providers_router
from server.api.analytics import router as analytics_router
from server.api.webhooks import router as webhooks_router
from server.tools.ghl import close_ghl_client
from server.memory.redis import RedisMemory

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)

logger = logging.getLogger(__name__)


def _log_config():
    keys = {
        "AssemblyAI (STT)": bool(settings.assemblyai_api_key),
        "Groq (LLM + TTS)": bool(settings.llm_api_key),
        "Gemini": bool(settings.gemini_api_key),
        "xAI / Grok": bool(settings.xai_api_key),
        "ElevenLabs": bool(settings.elevenlabs_api_key),
        "GHL CRM": bool(settings.ghl_api_key and settings.ghl_location_id),
        "FireCrawl (Search)": bool(settings.firecrawl_api_key),
    }
    logger.info("=== ZeebsOS Configuration ===")
    for name, ok in keys.items():
        logger.info("  %-20s %s", name, "READY" if ok else "NOT SET")
    logger.info("  %-20s %s", "Ollama", settings.ollama_base_url)
    logger.info("  %-20s %s", "Piper models dir", settings.piper_models_dir or "NOT SET")
    logger.info("  %-20s %s", "TTS provider", settings.tts_provider)
    logger.info("  %-20s %s", "LLM model", settings.llm_model)
    missing = [n for n, ok in keys.items() if not ok]
    if missing:
        logger.warning("Missing API keys: %s — those engines will not work", ", ".join(missing))


@asynccontextmanager
async def lifespan(_app: FastAPI):
    _log_config()
    memory = None
    if settings.redis_url:
        memory = RedisMemory(settings.redis_url)
        await memory.connect()
        _app.state.memory = memory
        logger.info("Redis memory enabled")
    else:
        _app.state.memory = None
        logger.info("Redis memory disabled (set REDIS_URL in .env to enable)")
    yield
    if memory:
        await memory.close()
    await close_ghl_client()


app = FastAPI(title="Voice Agent API", lifespan=lifespan)

app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(RateLimitMiddleware, trust_proxy_headers=settings.trust_proxy_headers)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins.split(","),
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)

app.include_router(ws_router)
app.include_router(crm_router)
app.include_router(providers_router)
app.include_router(analytics_router)
app.include_router(webhooks_router)


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "server.main:app",
        host=settings.host,
        port=settings.port,
        reload=True,
    )
