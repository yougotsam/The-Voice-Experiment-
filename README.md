# ZeebsOS

Real-time voice AI operating system with multi-agent routing, CRM integration, and a streaming STT-LLM-TTS pipeline.

## Overview

ZeebsOS is a full-stack voice agent that connects to multiple LLM providers (OpenAI, Gemini, Grok, Ollama), speech-to-text (AssemblyAI), and text-to-speech engines (ElevenLabs, Deepgram, Cartesia, Groq, xAI, Piper) through a real-time WebSocket pipeline. It includes a CRM panel powered by GoHighLevel and a multi-persona system for specialized agent behaviors.

See [ARCHITECTURE.md](ARCHITECTURE.md) for the full system design.

## Quick Start

### Prerequisites

- Node.js 20+
- Python 3.11+
- At minimum: an `ASSEMBLYAI_API_KEY` and one LLM API key

### Setup

```bash
# Clone and enter the project
git clone https://github.com/yougotsam/The-Voice-Experiment-.git
cd The-Voice-Experiment-

# Copy env and fill in your API keys
cp .env.example .env

# Backend
cd server
pip install -r requirements.txt
cd ..

# Frontend
cd web
npm install
cd ..
```

### Run (two terminals)

```bash
# Terminal 1 — Backend
python -m server.main

# Terminal 2 — Frontend
cd web && npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Run with Docker

```bash
docker compose up --build
```

This starts both the backend (port 8000) and frontend (port 3000) in a single container.

## Project Structure

```
server/           FastAPI backend
  pipeline/       Orchestrator, metrics, session management
  ws/             WebSocket handler and connection manager
  llm/            LLM provider abstraction (OpenAI-compatible)
  tts/            TTS providers (ElevenLabs, Deepgram, Cartesia, Groq, xAI, Piper)
  stt/            Speech-to-text (AssemblyAI)
  agents/         Multi-agent router and registry
  tools/          Tool definitions (GoHighLevel CRM)
  api/            REST endpoints (CRM, analytics, providers, webhooks)
web/              Next.js frontend
  src/components/ UI components (VoiceAgent, VoiceOrb, CRM, Analytics)
  src/hooks/      Custom hooks (WebSocket, microphone, VAD, audio playback)
```

## Environment Variables

See [.env.example](.env.example) for the full list. Key variables:

| Variable | Required | Description |
|---|---|---|
| `ASSEMBLYAI_API_KEY` | Yes | Speech-to-text |
| `LLM_API_KEY` | Yes | Primary LLM provider |
| `LLM_MODEL` | No | Default model (e.g. `gpt-4o-mini`) |
| `ELEVENLABS_API_KEY` | No | ElevenLabs TTS |
| `DEEPGRAM_API_KEY` | No | Deepgram TTS |
| `GHL_API_KEY` | No | GoHighLevel CRM integration |
| `GHL_LOCATION_ID` | No | GoHighLevel location |

## License

MIT
