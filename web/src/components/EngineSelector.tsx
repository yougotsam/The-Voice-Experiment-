"use client";

import { useCallback, useEffect, useState } from "react";

type ProviderOption = { id: string; name: string };

type Engine = {
  id: string;
  label: string;
  description: string;
  modelId?: string;
  ttsId?: string;
  integrated?: boolean;
};

type EngineSelectorProps = {
  onModelChange: (modelId: string) => void;
  onTTSChange: (providerId: string) => void;
  onEngineChange?: (modelId: string | undefined, ttsId: string | undefined) => void;
  onVoiceChange?: (voiceId: string) => void;
  serverConfig?: { model_id: string; tts_provider: string } | null;
};

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

function buildEngines(models: ProviderOption[], ttsProviders: ProviderOption[]): Engine[] {
  const engines: Engine[] = [];
  const groqTTS = ttsProviders.find((p) => p.id === "groq");
  const xaiTTS = ttsProviders.find((p) => p.id === "xai");
  const elevenlabs = ttsProviders.find((p) => p.id === "elevenlabs");
  const piperTTS = ttsProviders.find((p) => p.id === "piper");
  const grokRealtime = ttsProviders.find((p) => p.id === "grok-realtime");
  const ollamaModel = models.find((m) => m.id.startsWith("ollama-"));
  const gemini = models.find((m) => m.id.startsWith("gemini"));
  const groq8b = models.find((m) => m.id.startsWith("groq-llama-8b"));
  const grok = models.find((m) => m.id === "xai-grok-3");
  const grokMini = models.find((m) => m.id === "xai-grok-mini");
  const grokBest = grok || grokMini;

  if (groq8b && groqTTS) {
    engines.push({ id: "groqs-llama", label: "Groq's Llama", description: "Llama 8B + Groq voice", modelId: groq8b.id, ttsId: groqTTS.id });
  }
  if (gemini) {
    const tts = groqTTS || ttsProviders[0];
    engines.push({ id: "gemini-live", label: "Gemini Live", description: `Gemini Flash + ${tts?.name || "voice"}`, modelId: gemini.id, ttsId: tts?.id });
  }
  if (grokBest) {
    if (grokRealtime) {
      engines.push({ id: "grok-voice", label: "Grok Voice", description: "Live speech-to-speech", modelId: grokBest.id, ttsId: grokRealtime.id, integrated: true });
    } else {
      const tts = xaiTTS || groqTTS || ttsProviders[0];
      engines.push({ id: "grok-voice", label: "Grok Voice", description: `${grokBest.name} + ${tts?.name || "voice"}`, modelId: grokBest.id, ttsId: tts?.id });
    }
  }
  if (ollamaModel) {
    const tts = piperTTS || groqTTS || ttsProviders[0];
    if (tts) {
      engines.push({ id: "gemmaverse", label: "GemmaVerse", description: `${ollamaModel.name} + ${tts.name}`, modelId: ollamaModel.id, ttsId: tts.id });
    }
  }
  if (gemini && elevenlabs) {
    engines.push({ id: "elevenlabs", label: "Eleven Labs", description: "Gemini Flash + ElevenLabs", modelId: gemini.id, ttsId: elevenlabs.id });
  }
  if (ollamaModel && piperTTS) {
    engines.push({ id: "piper", label: "Piper", description: `${ollamaModel.name} + Piper`, modelId: ollamaModel.id, ttsId: piperTTS.id });
  }
  return engines;
}

export function EngineSelector({ onModelChange, onTTSChange, onEngineChange, onVoiceChange, serverConfig }: EngineSelectorProps) {
  const [engines, setEngines] = useState<Engine[]>([]);
  const [activeEngine, setActiveEngine] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [models, setModels] = useState<ProviderOption[]>([]);
  const [ttsProviders, setTTSProviders] = useState<ProviderOption[]>([]);
  const [activeModel, setActiveModel] = useState("");
  const [activeTTS, setActiveTTS] = useState("");
  const [synced, setSynced] = useState(false);
  const [voices, setVoices] = useState<ProviderOption[]>([]);
  const [activeVoice, setActiveVoice] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch(`${API_BASE}/api/providers/models`).then((r) => r.json()).catch(() => ({ models: [] })),
      fetch(`${API_BASE}/api/providers/tts`).then((r) => r.json()).catch(() => ({ providers: [] })),
    ]).then(([modelData, ttsData]) => {
      const m = modelData.models || [];
      const t = ttsData.providers || [];
      setModels(m);
      setTTSProviders(t);
      setActiveModel(modelData.default || m[0]?.id || "");
      setActiveTTS(ttsData.default || t[0]?.id || "");
      setEngines(buildEngines(m, t));
    }).finally(() => {
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (engines.length === 0 || synced) return;
    if (serverConfig) {
      const match = engines.find((e) => e.modelId === serverConfig.model_id && e.ttsId === serverConfig.tts_provider);
      if (match) {
        setActiveEngine(match.id);
        setActiveModel(match.modelId || "");
        setActiveTTS(match.ttsId || "");
      } else {
        setActiveEngine("");
        setActiveModel(serverConfig.model_id);
        setActiveTTS(serverConfig.tts_provider);
      }
      setSynced(true);
    }
  }, [serverConfig, engines, synced]);

  useEffect(() => {
    if (engines.length > 0 && !activeEngine && !synced) {
      setActiveEngine(engines[0].id);
    }
  }, [engines, activeEngine, synced]);

  useEffect(() => {
    setVoices([]);
    setActiveVoice("");
    if (!activeTTS) return;
    let cancelled = false;
    fetch(`${API_BASE}/api/providers/voices/${activeTTS}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        const v = data.voices || [];
        const defaultVoice = data.default || v[0]?.id || "";
        setVoices(v);
        setActiveVoice(defaultVoice);
        if (synced && defaultVoice) onVoiceChange?.(defaultVoice);
      })
      .catch(() => { if (!cancelled) { setVoices([]); setActiveVoice(""); } });
    return () => { cancelled = true; };
  }, [activeTTS, synced, onVoiceChange]);

  const handleEngineChange = useCallback(
    (engineId: string) => {
      if (!engineId) return;
      setActiveEngine(engineId);
      const engine = engines.find((e) => e.id === engineId);
      if (!engine) return;
      if (engine.modelId) setActiveModel(engine.modelId);
      if (engine.ttsId) setActiveTTS(engine.ttsId);
      if (onEngineChange) {
        onEngineChange(engine.modelId, engine.ttsId);
      } else {
        if (engine.modelId) onModelChange(engine.modelId);
        if (engine.ttsId) onTTSChange(engine.ttsId);
      }
    },
    [engines, onModelChange, onTTSChange, onEngineChange],
  );

  const handleModelOverride = useCallback(
    (modelId: string) => {
      setActiveModel(modelId);
      setActiveEngine("");
      onModelChange(modelId);
    },
    [onModelChange],
  );

  const handleTTSOverride = useCallback(
    (ttsId: string) => {
      setActiveTTS(ttsId);
      setActiveEngine("");
      onTTSChange(ttsId);
    },
    [onTTSChange],
  );

  const handleVoiceOverride = useCallback(
    (voiceId: string) => {
      setActiveVoice(voiceId);
      onVoiceChange?.(voiceId);
    },
    [onVoiceChange],
  );

  if (loading) {
    return (
      <div className="flex items-center gap-2">
        <div className="h-7 w-32 rounded-lg bg-ivory/5 animate-pulse" />
        <div className="h-7 w-20 rounded-lg bg-ivory/5 animate-pulse hidden sm:block" />
      </div>
    );
  }

  if (engines.length === 0) return null;

  const activeEngineData = engines.find((e) => e.id === activeEngine);

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="flex items-center gap-2">
        <select
          value={activeEngine}
          onChange={(e) => handleEngineChange(e.target.value)}
          aria-label="Engine preset"
          className="rounded-lg px-2.5 py-1.5 text-[11px] tracking-wide outline-none cursor-pointer
            text-ivory/70 bg-slate-navy/60 border border-gold/15
            transition-all duration-300 focus:ring-1 focus:ring-gold/30"
        >
          {engines.map((e) => (
            <option key={e.id} value={e.id}>{e.label}</option>
          ))}
        </select>
        {activeEngineData && (
          <span className="text-[9px] tracking-wide text-ivory/25 hidden sm:inline">
            {activeEngineData.description}
          </span>
        )}
        {voices.length > 0 && (
          <select
            value={activeVoice}
            onChange={(e) => handleVoiceOverride(e.target.value)}
            aria-label="Voice"
            className="rounded-lg px-2 py-1.5 text-[10px] tracking-wide outline-none cursor-pointer
              text-ivory/50 bg-slate-navy/60 border border-gold/10
              transition-all duration-300 focus:ring-1 focus:ring-gold/30"
          >
            {voices.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
        )}
        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="p-1 rounded-md transition-colors duration-200 hover:bg-gold/5"
          title="Advanced settings"
          aria-label="Toggle advanced engine settings"
          aria-expanded={showAdvanced}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"
            className={showAdvanced ? "text-gold-muted" : "text-ivory/25"}
          >
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
      </div>
      {showAdvanced && (
        <div className="flex items-center gap-1.5">
          <select value={activeModel} onChange={(e) => handleModelOverride(e.target.value)}
            aria-label="LLM model"
            className="rounded-lg px-2 py-1 text-[10px] outline-none cursor-pointer
              text-ivory/50 bg-slate-navy/60 border border-gold/10"
          >
            {models.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
          <select value={activeTTS} onChange={(e) => handleTTSOverride(e.target.value)}
            aria-label="TTS provider"
            className="rounded-lg px-2 py-1 text-[10px] outline-none cursor-pointer
              text-ivory/50 bg-slate-navy/60 border border-gold/10"
          >
            {ttsProviders.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
      )}
    </div>
  );
}
