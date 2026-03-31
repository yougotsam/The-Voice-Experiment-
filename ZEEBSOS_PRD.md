# ZeebsOS — Product Reference Document

> **Purpose**: Persistent reference for AI assistants and contributors. Captures the full build state so context is never lost between sessions.
>
> **Last updated**: 2026-03-30 | **PRs merged**: #1–#29

---

## 1. What Is ZeebsOS

ZeebsOS is a **voice-first AI operating system and CRM dashboard** built by AI Automation Studios. It combines real-time voice interaction (speech-to-text → LLM → text-to-speech) with a GoHighLevel CRM integration, multi-persona system, and a 3-pane web dashboard.

**Owner**: Sam Ahmed (yougotsam) — **not a developer**. All instructions must be explicit terminal commands.

---

## 2. Architecture

```
┌─────────────────────────────────────────────────┐
│  Frontend (Next.js 16 + React 19 + Tailwind 4)  │
│  npm run dev  →  http://localhost:3000           │
│  WebSocket ←→ ws://localhost:8000/ws             │
└──────────────────────┬──────────────────────────┘
                       │ WS (JSON + binary PCM)
┌──────────────────────▼──────────────────────────┐
│  Backend (FastAPI + Uvicorn)                     │
│  python3 -m server.main  →  http://localhost:8000│
│                                                  │
│  Pipeline: STT → LLM → TTS                      │
│  ┌─────────┐  ┌──────────┐  ┌─────────┐        │
│  │AssemblyAI│→ │OpenAI SDK│→ │TTS Chain│        │
│  │  (STT)   │  │ (LLM)   │  │(Groq/EL)│        │
│  └─────────┘  └──────────┘  └─────────┘        │
│                                                  │
│  Tools: GoHighLevel CRM (10 tools)              │
│  Agent Router: keyword + LLM intent classifier  │
└──────────────────────────────────────────────────┘
```

**Two-process system** — both must be running:
- Backend: `cd /path/to/The-Voice-Experiment- && python3 -m server.main`
- Frontend: `cd /path/to/The-Voice-Experiment-/web && npm run dev`

**Critical rule**: `.env` values **always override** code defaults in `server/config.py` (pydantic-settings). When changing defaults in code, the user's `.env` must also be updated or the old values persist.

---

## 3. APIs, Models, and Voices

### Speech-to-Text (STT)
| Provider | Model | Sample Rate | API |
|---|---|---|---|
| AssemblyAI | `u3-rt-pro` | 16 kHz | WebSocket streaming (`wss://streaming.assemblyai.com/v3/ws`) |

### LLM Models
| ID | Display Name | Model String | Base URL | API Key Config |
|---|---|---|---|---|
| `groq-llama-70b` | Llama 3.3 70B (Groq) | `llama-3.3-70b-versatile` | `https://api.groq.com/openai/v1` | `LLM_API_KEY` |
| `groq-llama-8b` | Llama 3.1 8B (Groq) | `llama-3.1-8b-instant` | `https://api.groq.com/openai/v1` | `LLM_API_KEY` |
| `gemini-flash` | Gemini 2.5 Flash | `gemini-2.5-flash` | `https://generativelanguage.googleapis.com/v1beta/openai/` | `GEMINI_API_KEY` |
| `xai-grok-mini` | Grok 3 Mini (xAI) | `grok-3-mini-fast` | `https://api.x.ai/v1` | `XAI_API_KEY` |
| `xai-grok-3` | Grok 3 (xAI) | `grok-3-fast` | `https://api.x.ai/v1` | `XAI_API_KEY` |

All LLM calls use the OpenAI SDK (`AsyncOpenAI`) — every provider above exposes an OpenAI-compatible endpoint.

### Text-to-Speech (TTS)
| Provider | Model | Voices | Input Limit | Notes |
|---|---|---|---|---|
| **Groq (Orpheus)** | `canopylabs/orpheus-v1-english` | troy, austin, daniel, autumn, diana, hannah | 180 chars (auto-chunked) | Uses same `LLM_API_KEY` (Groq) |
| **ElevenLabs** | `eleven_turbo_v2_5` | Configurable via `ELEVENLABS_VOICE_ID` | — | Paid, highest quality |
| **Piper** | `en_US-lessac-medium` | Built-in | — | Local/offline, CPU only |
| **Dia2** | `nari-labs/Dia2-2B` | Speaker `[S1]` | — | Local, GPU required |
| **CSM** | CSM-1B | — | — | Local, GPU required |
| **Fallback** | — | — | — | Tries providers in order |

**Active for Sam's setup**: `TTS_PROVIDER=groq` with voice `troy` and model `canopylabs/orpheus-v1-english`.

> **PlayAI is DEAD.** Groq decommissioned `playai-tts`, `Fritz-PlayAI`, and `Arista-PlayAI` in early 2026. Replaced by Canopy Labs Orpheus. Do NOT reference PlayAI anywhere.

### CRM Integration
| Service | Base URL | Auth |
|---|---|---|
| GoHighLevel (GHL) | `https://services.leadconnectorhq.com` | Private Integration Token (`GHL_API_KEY`) |

10 CRM tools: `search_contacts`, `create_contact`, `draft_content`, `get_calendar_events`, `move_opportunity`, `get_pipelines`, `create_opportunity`, `send_sms`, `send_email`, `get_conversations`.

---

## 4. Personas (Exact Names)

| ID | Name | Tagline | Greeting |
|---|---|---|---|
| `default` | **Zeebs** | Strategist & Closer | "Zeebs online. What are we building?" |
| `sales` | **Sales Pro** | Deals & Objections | "Sales Pro loaded. Who are we closing today?" |
| `ops` | **Ops Architect** | Systems & Automation | "Ops Architect here. Show me the bottleneck." |
| `creative` | **Creative Director** | Brand & Content | "Creative Director mode. Let's make something worth looking at." |
| `empathic` | **Companion** | Listen & Reflect | "I'm here. What's on your mind?" |

There are exactly 5 personas. No others exist.

---

## 5. Engine Presets (Frontend)

| Preset | LLM | TTS | Use Case |
|---|---|---|---|
| Groq Pipeline | Llama 3.3 70B | Groq Orpheus | Default, balanced |
| Groq Fast | Llama 3.1 8B | Groq Orpheus | Low-latency |
| Gemini Pipeline | Gemini 2.5 Flash | Best available | Google models |
| Grok Pipeline | Grok 3 | Best available | xAI models |
| Studio | Llama 3.3 70B | ElevenLabs | High-quality voice |

The first preset is auto-selected on page load and sends a `config` message to the backend.

---

## 6. WebSocket Protocol

**Endpoint**: `ws://localhost:8000/ws`

**Audio flow** (server → client):
1. `agent.audio.start` (JSON) — signals PCM stream beginning
2. Binary frames — raw PCM16 audio at 24 kHz
3. `agent.audio.end` (JSON) — signals stream end

**Client → Server**: `config`, `start`, `stop`, `interrupt`, `pong`, `text`

**Server → Client**: `transcript.partial`, `transcript.final`, `agent.text`, `agent.audio.start`, `agent.audio.end`, `error`, `status`, `metrics`, `ping`, `tool_call.start`, `tool_call.result`, `persona.loaded`, `model.loaded`, `tts.loaded`, `analytics`, `agent.routed`, `webhook.event`

---

## 7. File Inventory

### Backend (`server/`)

| Path | Purpose |
|---|---|
| `config.py` | All env-driven settings (pydantic-settings) |
| `main.py` | FastAPI app, CORS, routers, uvicorn |
| `personas.py` | 5 persona definitions and registry |
| `api/providers.py` | LLM model and TTS provider list endpoints |
| `api/crm.py` | CRM REST endpoints (contacts, pipelines, opportunities, conversations) |
| `api/analytics.py` | Business metrics aggregation from GHL |
| `api/webhooks.py` | Inbound GHL webhook receiver |
| `agents/base.py` | AgentConfig dataclass |
| `agents/registry.py` | 5 agent registrations (crm, comms, calendar, creative, default) |
| `agents/router.py` | Intent classifier → agent routing |
| `llm/base.py` | LLMProvider ABC |
| `llm/models.py` | MODEL_REGISTRY (5 models) |
| `llm/openai_compat.py` | OpenAI-compatible streaming LLM client |
| `stt/base.py` | STTProvider ABC |
| `stt/assemblyai.py` | AssemblyAI streaming STT |
| `tts/base.py` | TTSProvider ABC |
| `tts/groq.py` | Groq Orpheus TTS (HTTP, chunking) |
| `tts/elevenlabs.py` | ElevenLabs WebSocket TTS |
| `tts/piper.py` | Piper local TTS |
| `tts/dia2.py` | Dia2 local TTS |
| `tts/csm.py` | CSM local TTS |
| `tts/fallback.py` | Fallback chain TTS |
| `pipeline/orchestrator.py` | Main STT→LLM→TTS pipeline |
| `pipeline/session.py` | Conversation history management |
| `pipeline/metrics.py` | Per-session latency/usage tracking |
| `tools/base.py` | Tool ABC and registry |
| `tools/ghl.py` | 10 GoHighLevel CRM tools |
| `ws/handler.py` | WebSocket endpoint and message dispatch |
| `ws/connections.py` | Session registry for WS broadcast |
| `ws/protocol.py` | Message type enums and JSON codec |

### Frontend (`web/src/`)

| Path | Purpose |
|---|---|
| `app/layout.tsx` | Root layout |
| `app/page.tsx` | Main page |
| `components/VoiceAgent.tsx` | Main orchestrator — all panels, WS, mic, state machine |
| `components/VoiceOrb.tsx` | Animated orb (idle/listening/processing/speaking) |
| `components/EngineSelector.tsx` | Engine presets + advanced model/TTS controls |
| `components/PersonaSelector.tsx` | Persona list and selector |
| `components/TranscriptPanel.tsx` | Conversation transcript |
| `components/CRMPanel.tsx` | CRM dashboard (contacts, pipelines, etc.) |
| `components/AnalyticsPanel.tsx` | Session analytics (latency, usage) |
| `components/StagingArea.tsx` | Draft content staging |
| `components/MetricsOverlay.tsx` | Latency metrics overlay |
| `components/AudioVisualizer.tsx` | Audio waveform viz |
| `components/ProviderSelectors.tsx` | Provider selection UI |
| `components/TabPanel.tsx` | Generic tab wrapper |
| `hooks/useAudioPlayback.ts` | PCM playback via Web Audio API |
| `hooks/useMicrophone.ts` | Mic capture (PCM16, 16kHz) |
| `hooks/useVAD.ts` | Voice Activity Detection |
| `hooks/useWebSocket.ts` | WS connection with auto-reconnect |
| `types.ts` | Shared types |

---

## 8. Environment Variables

All variables are defined in `.env.example`. Copy to `.env` and fill in real keys.

| Variable | Purpose | Example Value |
|---|---|---|
| `ASSEMBLYAI_API_KEY` | STT | (your key) |
| `LLM_API_KEY` | Groq LLM + Groq TTS | (your key) |
| `LLM_BASE_URL` | LLM endpoint | `https://api.groq.com/openai/v1` |
| `LLM_MODEL` | Default LLM model | `llama-3.3-70b-versatile` |
| `ELEVENLABS_API_KEY` | ElevenLabs TTS | (your key) |
| `ELEVENLABS_VOICE_ID` | ElevenLabs voice | `JBFqnCBsd6RMkjVDRZzb` |
| `GEMINI_API_KEY` | Google Gemini LLM | (your key) |
| `XAI_API_KEY` | xAI Grok LLM | (your key) |
| `GROQ_TTS_VOICE` | Orpheus voice | `troy` |
| `GROQ_TTS_MODEL` | Orpheus model | `canopylabs/orpheus-v1-english` |
| `TTS_PROVIDER` | Active TTS | `groq` or `elevenlabs` or `fallback` |
| `TTS_FALLBACK_CHAIN` | Fallback order | `groq,elevenlabs` |
| `GHL_API_KEY` | GoHighLevel token | (your key) |
| `GHL_LOCATION_ID` | GHL location | (your ID) |
| `GHL_WEBHOOK_SECRET` | Webhook auth | (random string) |
| `HOST` | Server bind | `0.0.0.0` |
| `PORT` | Server port | `8000` |
| `CORS_ORIGINS` | Allowed origins | `http://localhost:3000` |

---

## 9. Build History (Merged PRs)

| PR | Title | What It Did |
|---|---|---|
| #1–#9 | Foundation | Initial project scaffolding, voice pipeline, basic UI |
| #10 | LLM model selector | Multi-model support with hot-switching |
| #11 | Persona system | 5 personas with voice identity |
| #12 | ElevenLabs TTS | WebSocket streaming TTS |
| #13 | TTS fallback chain | Multi-provider fallback |
| #14 | Pipeline metrics | Latency tracking and analytics |
| #15 | CRM tools | GoHighLevel tool integration |
| #16 | Agent router | Intent-based agent dispatch |
| #17 | CRM panel | Dashboard CRM UI |
| #18 | Analytics panel | Business metrics UI |
| #19 | Staging area | Draft content management |
| #20 | Audio visualizer | Waveform visualization |
| #21–#24 | Phase 2 | Dashboard polish, metrics overlay, provider selectors, UI refinements |
| #25 | CRM awareness fix | CRM context in agent responses |
| #26 | Dashboard overhaul | 3-pane layout redesign |
| #27 | GHL webhooks | Real-time CRM event streaming |
| #28 | SSL certifi fix | macOS Python 3.13 SSL cert verification |
| #29 | Groq TTS migration | PlayAI → Orpheus, text chunking, error visibility |

---

## 10. Known Issues and Gotchas

1. **macOS Python 3.13 SSL**: All network clients use `certifi.where()` for CA bundle. Without this, every API call fails with `CERTIFICATE_VERIFY_FAILED`.

2. **Orpheus 180-char limit**: Groq Orpheus rejects inputs >200 chars. `GroqTTS._split_text()` chunks at word boundaries (180 chars).

3. **EngineSelector auto-select**: On page load, the first engine preset is auto-selected and sends a config message to the backend. This can override `TTS_PROVIDER` from `.env`.

4. **python-dotenv line 1 parsing**: If `.env` line 1 has no `=` sign (e.g. stray text), python-dotenv warns. Ensure line 1 is a valid `KEY=value` or comment.

5. **Dia2 and CSM in .env comments**: These are listed as TTS_PROVIDER options in `.env.example` comments for completeness. They require GPU and local model setup — they are NOT active and NOT what Sam uses.

---

## 11. Roadmap (Remaining Phase 3)

- Conversation memory (persistent across sessions)
- Per-persona voice IDs (different TTS voice per persona)
- Gemini Live / Grok Voice integration (native voice APIs)

---

## 12. Development Notes

**User's machine**: MacBook Pro 16GB i9, macOS, Python 3.13 at `/Library/Frameworks/Python.framework/Versions/3.13/`

**User's project path**: `/Users/sameerahmed/The-Voice-Experiment-`

**How to start** (two separate terminal tabs):
```bash
# Tab 1 — Backend
cd /Users/sameerahmed/The-Voice-Experiment-
python3 -m server.main

# Tab 2 — Frontend
cd /Users/sameerahmed/The-Voice-Experiment-/web
npm run dev
```

**How to pull latest changes**:
```bash
cd /Users/sameerahmed/The-Voice-Experiment-
git pull origin main
```

**Dependencies**:
```bash
# Backend
pip3 install -r requirements.txt

# Frontend
cd web && npm install
```
