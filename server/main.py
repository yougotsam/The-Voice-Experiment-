import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from contextlib import asynccontextmanager

from server.config import settings
from server.ws.handler import router as ws_router
from server.api.crm import router as crm_router
from server.api.providers import router as providers_router
from server.api.analytics import router as analytics_router
from server.api.webhooks import router as webhooks_router
from server.tools.ghl import close_ghl_client

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)

@asynccontextmanager
async def lifespan(_app: FastAPI):
    yield
    await close_ghl_client()


app = FastAPI(title="Voice Agent API", lifespan=lifespan)

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
