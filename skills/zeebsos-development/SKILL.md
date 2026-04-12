---
name: zeebsos-development
description: >
  ZeebsOS development conventions and code style guide. Use when writing new
  code, reviewing PRs, or debugging issues. Covers Python backend patterns,
  TypeScript frontend patterns, environment setup, and testing.
---

# ZeebsOS Development Guide

## Environment Setup

```bash
# Backend
pip install -r requirements.txt
cp .env.example .env  # Then fill in API keys

# Frontend
cd web && npm install

# Run
python3 -m server.main         # Backend on :8000
cd web && npm run dev           # Frontend on :3000
```

### Required API Keys (minimum viable)
- `ASSEMBLYAI_API_KEY` — STT (speech-to-text)
- `LLM_API_KEY` — Groq key for LLM + TTS
- At least one of: `XAI_API_KEY`, `ELEVENLABS_API_KEY` for additional TTS

### Optional
- `GEMINI_API_KEY` — Google Gemini LLM
- `GHL_API_KEY` + `GHL_LOCATION_ID` — CRM integration
- `REDIS_URL` — Cross-session memory persistence

## Python Backend Conventions

### Config
- All settings in `server/config.py` via Pydantic `BaseSettings`
- Settings load from `.env` automatically
- Access via `from server.config import settings`
- When adding a new setting: add to `Settings` class, `.env.example`, and `_log_config()` in `main.py`

### Logging
- Use `logger = logging.getLogger(__name__)` at module level
- Use lazy `%s` interpolation: `logger.info("Connected: %s", session_id)`
- Always include `exc_info=True` on warnings about failures
- Include `session_id` in WebSocket handler logs for traceability

### Error Handling
- Never use bare `except:` — always `except Exception:`
- Log with `logger.exception()` for unexpected errors (includes traceback)
- For user-facing errors, send via `send_json("error", {"text": "..."})` 
- Classify LLM errors through `_classify_llm_error()` in orchestrator
- TTS errors use the typed hierarchy: `TTSAuthError`, `TTSRateLimitError`, `TTSTimeoutError`, `TTSError`

### Abstract Base Classes
All providers follow the same pattern:
```python
from abc import ABC, abstractmethod

class SomeProvider(ABC):
    @abstractmethod
    async def do_thing(self) -> Result: ...
```
- STT: `server/stt/base.py` — `STTProvider`
- LLM: `server/llm/base.py` — `LLMProvider`
- TTS: `server/tts/base.py` — `TTSProvider`
- Tools: `server/tools/base.py` — `Tool`

### Tool Pattern
```python
class MyTool(Tool):
    @property
    def name(self) -> str:
        return "my_tool"

    @property
    def description(self) -> str:
        return "What this tool does"

    @property
    def parameters(self) -> dict:
        return {
            "type": "object",
            "properties": { ... },
            "required": [ ... ],
        }

    async def execute(self, **kwargs) -> dict[str, Any]:
        # Return dict with results, or {"error": "message"} on failure
        return {"result": "value"}
```

### Persona Pattern
Personas are frozen dataclasses in `server/personas.py`:
- `id` — matches frontend PersonaSelector IDs
- `system_prompt` — must say "Never use markdown" (voice output)
- `greeting` — first message on persona load
- Keep prompts to 1-3 sentence response instructions

### WebSocket Handler
`server/ws/handler.py` is the central nervous system. When modifying:
- All client message types are in `ClientMessageType` enum
- All server message types are in `ServerMessageType` enum
- Add new enums before using new message types
- The handler creates per-session instances — no shared mutable state between connections
- Always clean up resources in the `finally` block

## TypeScript Frontend Conventions

### Component Patterns
- All components use `"use client"` directive
- State machine: `AgentState = "idle" | "listening" | "processing" | "speaking"`
- `VoiceAgent.tsx` is the main orchestrator — it owns all state
- Child components receive callbacks, not WebSocket access

### WebSocket Hook
- `useWebSocket.ts` handles connection, auto-reconnect (2s), ping/pong
- Returns `{ connected, sendJSON, sendBinary }`
- Callbacks via refs to avoid reconnection on handler changes
- Binary messages (ArrayBuffer) = audio; text messages (JSON) = control

### TranscriptEntry Type
```typescript
type TranscriptEntry = {
  role: "user" | "agent" | "tool" | "system";
  text: string;
  timestamp: number;
  toolName?: string;
  toolSuccess?: boolean;
  imageUrl?: string;
};
```

### Adding a New Server Message Type
1. Add to `ServerMessageType` enum in `server/ws/protocol.py`
2. Add to `ServerMessage` union type in `web/src/hooks/useWebSocket.ts`
3. Add `case` handler in `VoiceAgent.tsx` `handleMessage`
4. Add any new fields to `BaseMessage` type in `useWebSocket.ts`

### Styling
- Tailwind CSS with custom design tokens in `globals.css`
- Color system: `--color-text-primary`, `--color-accent-default`, etc.
- Glass morphism panels: `glass-panel` utility class
- Micro labels: `micro-label` utility class
- No external UI component libraries

## Common Pitfalls

1. **Pydantic `extra` fields**: `Settings` class rejects unknown `.env` fields.
   When removing a config field, users must also delete it from their `.env`.

2. **macOS uses `python3`**: Always document commands with `python3 -m server.main`.

3. **Turbopack file limits**: In sandboxed environments, `next dev` (Turbopack) may
   crash with "Too many open files". Use `next start` (production build) instead.

4. **WebSocket binary = audio**: The frontend sends raw PCM16 ArrayBuffers for mic
   audio. Never parse binary messages as JSON.

5. **AssemblyAI v3 vs v2**: Some API key tiers only work with v2. The STT module
   auto-falls back, but both endpoints need the key to be valid.

6. **TTS fallback chain**: `TTS_FALLBACK_CHAIN` in `.env` must only contain valid
   provider names: `groq`, `xai`, `elevenlabs`, `piper`. Stale names (e.g., `deepgram`)
   will log warnings.

7. **Session memory**: Redis memory is optional. If `REDIS_URL` is not set, conversation
   history is in-memory only and lost on disconnect.
