---
name: zeebsos-architecture
description: >
  ZeebsOS voice agent architecture guide. Use when understanding, modifying,
  or extending the real-time voice pipeline, WebSocket protocol, agent routing,
  or tool system. Covers the full stack from microphone capture to TTS playback.
---

# ZeebsOS Architecture

## System Overview

ZeebsOS is a real-time voice-first AI agent with CRM integration. The architecture
is a WebSocket-driven pipeline: browser microphone -> STT -> LLM -> TTS -> browser audio.

```
Browser (Next.js)           Server (FastAPI)
┌──────────────┐           ┌───────────────────────────┐
│ Microphone   │──PCM16──> │ WebSocket /ws              │
│ AudioWorklet │           │  ├─ AssemblyAI STT         │
│              │           │  ├─ Agent Router            │
│ AudioContext │<──PCM16── │  ├─ LLM (OpenAI-compat)    │
│ (playback)   │           │  ├─ Tool Execution          │
│              │           │  ├─ TTS (fallback chain)    │
│ React UI     │<──JSON──  │  └─ Session + Memory        │
└──────────────┘           └───────────────────────────┘
```

## Directory Structure

```
server/
├── main.py                 # FastAPI app, lifespan, CORS, router registration
├── config.py               # Pydantic BaseSettings from .env
├── personas.py             # 5 persona definitions (system prompts + greetings)
├── ws/
│   ├── handler.py          # WebSocket endpoint /ws — the central nervous system
│   ├── protocol.py         # ClientMessageType / ServerMessageType enums
│   └── connections.py      # ConnectionManager for broadcast (webhooks)
├── pipeline/
│   ├── orchestrator.py     # STT->LLM->TTS pipeline, tool loop, LAYERS framework
│   ├── session.py          # ConversationSession (history, persona, Redis memory)
│   └── metrics.py          # Per-session latency and tool usage tracking
├── stt/
│   ├── base.py             # Abstract STTProvider
│   └── assemblyai.py       # AssemblyAI WebSocket STT (v3 with v2 fallback)
├── llm/
│   ├── base.py             # Abstract LLMProvider
│   ├── openai_compat.py    # OpenAI SDK-based LLM (works with Groq, Gemini, xAI, Ollama)
│   └── models.py           # MODEL_REGISTRY with 6 model configs
├── tts/
│   ├── base.py             # Abstract TTSProvider
│   ├── groq.py             # Groq Orpheus TTS
│   ├── xai.py              # xAI TTS
│   ├── elevenlabs.py       # ElevenLabs TTS
│   ├── piper.py            # Local Piper TTS
│   ├── fallback.py         # FallbackTTS chain
│   ├── retry.py            # TTS retry logic
│   └── errors.py           # TTSError hierarchy
├── realtime/
│   └── xai.py              # Full-duplex xAI Realtime voice session
├── agents/
│   ├── base.py             # AgentConfig dataclass
│   ├── registry.py         # 5 agents: crm, comms, calendar, creative, default
│   └── router.py           # Keyword + LLM intent classifier
├── tools/
│   ├── base.py             # Abstract Tool + ToolRegistry
│   ├── ghl.py              # 10 GoHighLevel CRM tools
│   └── imagine.py          # Grok Imagine (grok-2-image) tool
├── memory/
│   └── redis.py            # RedisMemory for cross-session persistence
└── api/
    ├── crm.py              # REST endpoints for CRM dashboard
    ├── providers.py        # REST endpoints listing models/voices
    ├── analytics.py        # Pipeline metrics aggregation
    └── webhooks.py         # GHL webhook receiver + WS broadcast

web/src/
├── app/                    # Next.js app router
├── components/
│   ├── VoiceAgent.tsx      # Main orchestrator component (state machine)
│   ├── TranscriptPanel.tsx # Chat transcript with image support
│   ├── VoiceOrb.tsx        # Animated voice button
│   ├── EngineSelector.tsx  # Model/TTS/voice picker
│   ├── PersonaSelector.tsx # Persona switcher
│   ├── CRMPanel.tsx        # CRM dashboard panel
│   ├── AnalyticsPanel.tsx  # Session analytics
│   └── StagingArea.tsx     # Content drafts panel
├── hooks/
│   ├── useWebSocket.ts     # WebSocket connection with auto-reconnect
│   ├── useMicrophone.ts    # AudioWorklet microphone capture
│   ├── useAudioPlayback.ts # PCM16 audio queue playback
│   └── useVAD.ts           # Voice Activity Detection
└── types/index.ts
```

## WebSocket Protocol

### Client -> Server

| Type | Payload | Purpose |
|---|---|---|
| `start` | — | Begin STT listening |
| `stop` | — | Stop STT, trigger LLM response |
| `interrupt` | — | Cancel current response |
| `text` | `{ text }` | Direct text input |
| `config` | `{ persona_id?, model_id?, tts_provider?, voice_id? }` | Runtime config change |
| `pong` | — | Keep-alive response |
| (binary) | ArrayBuffer | Raw PCM16 audio at 16kHz |

### Server -> Client

| Type | Payload | Purpose |
|---|---|---|
| `transcript.partial` | `{ text }` | Streaming user transcript |
| `transcript.final` | `{ text }` | Final user transcript |
| `agent.text` | `{ text }` | Streamed agent text (sentence chunks) |
| `agent.image` | `{ image_url, prompt }` | Generated image from Grok Imagine |
| `agent.audio.start` | `{ sample_rate }` | Audio stream beginning |
| `agent.audio.end` | — | Audio stream complete |
| `status` | `{ status }` | State: idle, processing, listening |
| `tool_call.start` | `{ name, arguments }` | Tool invocation started |
| `tool_call.result` | `{ name, success, summary }` | Tool result |
| `persona.loaded` | `{ persona_id, name, greeting }` | Persona switch ack |
| `agent.routed` | `{ agent_id, name }` | Agent routing notification |
| `metrics` | `{ llm_ttfb_ms, tts_ttfb_ms, total_ms }` | Per-turn latency |
| `error` | `{ text }` | Error message |
| `config.current` | `{ model_id, tts_provider }` | Current server config |
| (binary) | ArrayBuffer | Raw PCM16 audio chunks |

## Key Patterns

### LLM Fallback Chain
`orchestrator.py` defines `LLM_FALLBACK_ORDER`. On rate limit (429), the orchestrator
auto-switches to the next available model, processes the response, then restores the primary.

### TTS Fallback Chain
When `TTS_PROVIDER=fallback`, `FallbackTTS` tries providers in `TTS_FALLBACK_CHAIN` order.
Each provider is created at connection time and tried sequentially per synthesis call.

### Tool Loop
The orchestrator runs up to `MAX_TOOL_ROUNDS=3` iterations. Each round: stream LLM response,
if tool_calls are returned, execute them, add results to history, and loop. If no tool_calls,
emit the text response and break.

### LAYERS Framework
Every system prompt includes the LAYERS framework (Lens, Assignment, Yield, Evidence,
Reasoning, Safeguards) for structured persona reasoning and injection resistance.

### Agent Routing
`AgentRouter.should_route()` does a keyword regex pre-filter. If triggered,
`classify()` sends the message through the LLM to classify intent into one of
5 agents (crm, comms, calendar, creative, default). Each agent has scoped tools.

### Redis Memory
Optional. On connect: loads prior session summary into system prompt + restores history.
On disconnect: persists user/assistant messages to Redis (30-day TTL).
Gracefully degrades to session-only when Redis is unavailable.

## Adding a New Provider

### New TTS Provider
1. Create `server/tts/newprovider.py` extending `TTSProvider`
2. Implement `synthesize()` async generator yielding PCM16 bytes
3. Add to `_create_single_tts()` in `server/ws/handler.py`
4. Add to `VALID_TTS_PROVIDERS` set
5. Add API key to `config.py` and `.env.example`

### New LLM Model
1. Add `ModelConfig` to `MODEL_REGISTRY` in `server/llm/models.py`
2. Ensure the provider uses OpenAI-compatible API format
3. Add API key setting to `config.py`

### New Tool
1. Create class extending `Tool` in `server/tools/`
2. Define `name`, `description`, `parameters`, `execute()`
3. Register in `server/ws/handler.py` tool_registry setup
4. Add to relevant agent's tools list in `server/agents/registry.py`
5. Add summary case to `Orchestrator._summarize_tool_result()`
