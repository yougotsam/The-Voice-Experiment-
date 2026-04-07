# ZeebsOS Architecture

Real-time voice AI operating system built on a streaming STT → LLM → TTS pipeline with multi-agent routing and CRM integration.

## System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     Next.js Frontend                        │
│                                                             │
│  AudioWorklet (16kHz PCM16) ──► WebSocket ──► STT           │
│  VAD (Silero ONNX)              ▲                           │
│  Jitter Buffer ◄── audio bytes ─┘                           │
│                                                             │
│  Tabs: Transcript │ CRM │ Analytics │ Staging Area          │
│  Controls: Persona │ LLM Model │ TTS Provider selectors     │
└─────────────────────┬───────────────────────────────────────┘
                      │ WebSocket (binary audio + JSON messages)
┌─────────────────────▼───────────────────────────────────────┐
│                   FastAPI Backend                            │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │                   Orchestrator                       │    │
│  │                                                     │    │
│  │  STT ──► Agent Router ──► LLM ──► TTS               │    │
│  │               │              │                      │    │
│  │          Tool Registry   Tool Calls                 │    │
│  │          (scoped by      (GHL CRM)                  │    │
│  │           agent)                                    │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  REST APIs: /api/crm │ /api/providers │ /api/analytics      │
└─────────────────────────────────────────────────────────────┘
```

## Backend (`server/`)

### Pipeline (`server/pipeline/`)

The core voice loop lives in `orchestrator.py`:

1. **STT** receives audio chunks, emits partial/final transcripts
2. **Agent Router** classifies user intent → selects specialist agent → scopes available tools
3. **LLM** streams response tokens, may include tool calls (up to 3 rounds)
4. **TTS** synthesizes each sentence as it completes (streaming sentence-by-sentence)
5. **Metrics** records TTFB, tool calls, agent/model usage per interaction

`session.py` manages conversation history with a sliding context window. Messages are stored as OpenAI-format dicts (role/content/tool_calls/tool_call_id).

`metrics.py` collects per-session telemetry: latency samples, tool call counts, persona/model/agent usage breakdowns. The `snapshot()` method serializes everything for the frontend analytics panel.

### Agents (`server/agents/`)

Multi-agent routing with intent classification:

| Agent | Tools | Trigger Keywords |
|---|---|---|
| `crm` | search_contacts, create_contact, get_pipelines, create_opportunity, move_opportunity | contact, pipeline, deal, opportunity |
| `comms` | send_sms, send_email, get_conversations | sms, email, message, text |
| `calendar` | get_calendar_events | calendar, schedule, meeting, appointment |
| `creative` | draft_content | draft, blog, post, write, content |
| `default` | all tools | everything else |

`router.py` has a two-stage gate:
- **Heuristic** (`should_route`): messages < 3 words or without task keywords skip routing entirely (zero-overhead chit-chat)
- **LLM classification** (`classify`): single-shot prompt returns agent ID

Tool scoping is enforced at execution time — `_execute_tool_calls` resolves tools from the scoped registry, not the full registry.

### LLM (`server/llm/`)

All LLM providers use `AsyncOpenAI` with different `base_url`/`api_key` combinations:

| Model ID | Provider | Model | Base URL |
|---|---|---|---|
| `groq-llama-70b` | Groq | llama-3.3-70b-versatile | api.groq.com |
| `groq-llama-8b` | Groq | llama-3.1-8b-instant | api.groq.com |
| `gemini-flash` | Google | gemini-2.0-flash | generativelanguage.googleapis.com |
| `xai-grok-mini` | xAI | grok-3-mini-fast | api.x.ai |
| `xai-grok-3` | xAI | grok-3-fast | api.x.ai |

Models are switchable at runtime via WebSocket `config` messages. The `OpenAICompatLLM.set_model()` method swaps the client in-place.

### TTS (`server/tts/`)

| Provider | Type | Notes |
|---|---|---|
| `groq` | Cloud API | Uses same Groq API key as LLM. Orpheus voices. Default. |
| `xai` | Cloud API | xAI TTS. 5 voices (Eve, Ara, Rex, Sal, Leo). |
| `elevenlabs` | Cloud WebSocket | High quality streaming. 8 curated voices. Paid. |
| `grok-realtime` | Cloud WebSocket | Speech-to-speech via xAI. Full-duplex. |
| `fallback` | Chain | Tries providers in configured order. |

`FallbackTTS` iterates the chain, catching exceptions per-provider. TTS is swappable at runtime via `Orchestrator.set_tts()` which closes the old provider before swapping.

### STT (`server/stt/`)

AssemblyAI real-time WebSocket API. Sends 16kHz PCM16 audio, receives partial and final transcripts. The provider has a `force_flush()` method to drain buffered audio on stop.

### Tools (`server/tools/`)

`ToolRegistry` holds registered `Tool` instances. Each tool has a name, OpenAI function-calling schema, and an async `execute()` method.

`ghl.py` implements 10 GoHighLevel CRM tools: contact CRUD, pipeline/opportunity management, SMS/email, calendar events, conversations, and content drafting. All GHL tools (except `draft_content`) require `GHL_API_KEY` and `GHL_LOCATION_ID`.

`ToolRegistry.subset(names)` creates a filtered registry for agent-scoped tool access.

### WebSocket Protocol (`server/ws/`)

Binary frames = raw audio (PCM16 16kHz). Text frames = JSON with `type` field.

**Client → Server:**
`start` | `stop` | `interrupt` | `text` | `config` | `pong`

**Server → Client:**
`status` | `transcript.partial` | `transcript.final` | `agent.text` | `agent.audio.start` | `agent.audio.end` | `agent.routed` | `tool_call.start` | `tool_call.result` | `metrics` | `analytics` | `persona.loaded` | `model.loaded` | `tts.loaded` | `error` | `ping`

### REST APIs (`server/api/`)

- `GET /api/providers/models` — available LLM models + current default
- `GET /api/providers/tts` — available TTS providers + current default
- `GET /api/crm/contacts` — search GHL contacts
- `POST /api/crm/contacts` — create contact
- `GET /api/analytics/business` — pipeline stats, contact counts (paginated up to 1000 opportunities)

### Personas (`server/personas.py`)

Persona definitions with name, system prompt, greeting, and optional voice ID. Selected at runtime via the persona selector. Available personas: Zeebs (default), Sales Pro, Ops Architect, Creative Director, Companion (empathic).

## Frontend (`web/`)

### Hooks

- `useWebSocket` — manages WS lifecycle, message dispatch, reconnection
- `useMicrophone` — AudioWorklet capture at 16kHz, PCM16 encoding
- `useAudioPlayback` — Web Audio API with jitter buffer for smooth streaming playback
- `useVAD` — client-side Voice Activity Detection (Silero ONNX via `@ricky0123/vad-web`)

### Components

- `VoiceAgent` — root orchestrator component wiring all hooks and panels together
- `VoiceOrb` — animated state indicator (idle/listening/processing/speaking)
- `TranscriptPanel` — scrollable conversation log with user/agent/tool/system entries
- `PersonaSelector` — persona dropdown
- `ProviderSelectors` — LLM model and TTS provider dropdowns (synced with server defaults)
- `AnalyticsPanel` — session metrics (latency sparklines, tool/model/agent usage bars) + business metrics (GHL pipeline stats)
- `CRMPanel` — contacts and opportunities from GoHighLevel
- `StagingArea` — pending tool call results
- `MetricsOverlay` — per-message latency badges
- `AudioVisualizer` — canvas-based waveform

## Configuration

All settings are in `.env` (loaded by pydantic-settings). See `.env.example` for all variables.

**Required:** `ASSEMBLYAI_API_KEY`, `LLM_API_KEY`

**Optional:** `GEMINI_API_KEY`, `XAI_API_KEY`, `ELEVENLABS_API_KEY`, `GHL_API_KEY`, `GHL_LOCATION_ID`

## Running

```bash
# Backend
cd server && pip install -r requirements.txt && cd ..
uvicorn server.main:app --host 0.0.0.0 --port 8000

# Frontend
cd web && npm install && npm run dev
```
