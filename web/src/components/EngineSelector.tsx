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
  onEngineChange: (modelId: string | undefined, ttsId: string | undefined) => void;
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

export function EngineSelector({ onEngineChange, onVoiceChange, serverConfig }: EngineSelectorProps) {
  const [engines, setEngines] = useState<Engine[]>([]);
  const [activeEngine, setActiveEngine] = useState("");
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
        setActiveTTS(match.ttsId || "");
      } else {
        const fallback = engines[0];
        setActiveEngine(fallback?.id || "");
        setActiveTTS(fallback?.ttsId || "");
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
      if (engine.ttsId) setActiveTTS(engine.ttsId);
      onEngineChange(engine.modelId, engine.ttsId);
    },
    [engines, onEngineChange],
  );

  const handleVoiceChange = useCallback(
    (voiceId: string) => {
      setActiveVoice(voiceId);
      onVoiceChange?.(voiceId);
    },
    [onVoiceChange],
  );

  if (loading) {
    return (
      <div className="flex items-center gap-2">
        <div className="skeleton h-7 w-32" />
        <div className="skeleton h-7 w-20 hidden sm:block" />
      </div>
    );
  }

  if (engines.length === 0) return null;

  const activeEngineData = engines.find((e) => e.id === activeEngine);

  return (
    <div className="flex items-center gap-2">
      <select
        value={activeEngine}
        onChange={(e) => handleEngineChange(e.target.value)}
        aria-label="Engine"
        className="custom-select"
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
          onChange={(e) => handleVoiceChange(e.target.value)}
          aria-label="Voice"
          className="custom-select text-[11px]"
        >
          {voices.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
        </select>
      )}
    </div>
  );
}
