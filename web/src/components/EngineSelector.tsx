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
};

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

function buildEngines(models: ProviderOption[], ttsProviders: ProviderOption[]): Engine[] {
  const engines: Engine[] = [];
  const groqModel = models.find((m) => m.id.startsWith("groq-llama-70b"));
  const groqTTS = ttsProviders.find((p) => p.id === "groq");
  if (groqModel && groqTTS) {
    engines.push({ id: "groq-pipeline", label: "Groq Pipeline", description: "Llama 3.3 70B + PlayAI TTS", modelId: groqModel.id, ttsId: groqTTS.id });
  }
  const groq8b = models.find((m) => m.id.startsWith("groq-llama-8b"));
  if (groq8b && groqTTS) {
    engines.push({ id: "groq-fast", label: "Groq Fast", description: "Llama 3.1 8B + PlayAI TTS", modelId: groq8b.id, ttsId: groqTTS.id });
  }
  const gemini = models.find((m) => m.id.startsWith("gemini"));
  if (gemini) {
    const tts = groqTTS || ttsProviders[0];
    engines.push({ id: "gemini-pipeline", label: "Gemini Pipeline", description: `Gemini Flash + ${tts?.name || "TTS"}`, modelId: gemini.id, ttsId: tts?.id });
  }
  const grok = models.find((m) => m.id === "xai-grok-3");
  if (grok) {
    const tts = groqTTS || ttsProviders[0];
    engines.push({ id: "grok-pipeline", label: "Grok Pipeline", description: `Grok 3 + ${tts?.name || "TTS"}`, modelId: grok.id, ttsId: tts?.id });
  }
  const elevenlabs = ttsProviders.find((p) => p.id === "elevenlabs");
  if (groqModel && elevenlabs) {
    engines.push({ id: "studio", label: "Studio", description: "Llama 70B + ElevenLabs (HQ)", modelId: groqModel.id, ttsId: elevenlabs.id });
  }
  return engines;
}

export function EngineSelector({ onModelChange, onTTSChange }: EngineSelectorProps) {
  const [engines, setEngines] = useState<Engine[]>([]);
  const [activeEngine, setActiveEngine] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [models, setModels] = useState<ProviderOption[]>([]);
  const [ttsProviders, setTTSProviders] = useState<ProviderOption[]>([]);
  const [activeModel, setActiveModel] = useState("");
  const [activeTTS, setActiveTTS] = useState("");

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
      const built = buildEngines(m, t);
      setEngines(built);
      if (built.length > 0) setActiveEngine(built[0].id);
    });
  }, []);

  const handleEngineChange = useCallback(
    (engineId: string) => {
      setActiveEngine(engineId);
      const engine = engines.find((e) => e.id === engineId);
      if (!engine) return;
      if (engine.modelId) {
        setActiveModel(engine.modelId);
        onModelChange(engine.modelId);
      }
      if (engine.ttsId) {
        setActiveTTS(engine.ttsId);
        onTTSChange(engine.ttsId);
      }
    },
    [engines, onModelChange, onTTSChange],
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

  if (engines.length === 0) return null;

  const activeEngineData = engines.find((e) => e.id === activeEngine);

  return (
    <div className="flex items-center gap-2">
      <select
        value={activeEngine}
        onChange={(e) => handleEngineChange(e.target.value)}
        className="rounded-lg px-2.5 py-1.5 text-[11px] tracking-wide outline-none cursor-pointer transition-all duration-300 focus:ring-1 focus:ring-gold/30"
        style={{
          color: "rgba(244, 240, 234, 0.7)",
          background: "rgba(10, 22, 36, 0.6)",
          border: "1px solid rgba(200, 169, 126, 0.15)",
        }}
      >
        {engines.map((e) => (
          <option key={e.id} value={e.id}>{e.label}</option>
        ))}
        {!activeEngine && <option value="">Custom</option>}
      </select>
      {activeEngineData && (
        <span className="text-[9px] tracking-wide hidden sm:inline" style={{ color: "rgba(244, 240, 234, 0.25)" }}>
          {activeEngineData.description}
        </span>
      )}
      <button
        type="button"
        onClick={() => setShowAdvanced(!showAdvanced)}
        className="p-1 rounded-md transition-colors duration-200 hover:bg-gold/5"
        title="Advanced settings"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"
          style={{ color: showAdvanced ? "rgba(200, 169, 126, 0.6)" : "rgba(244, 240, 234, 0.25)" }}
        >
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </button>
      {showAdvanced && (
        <div className="flex items-center gap-2">
          <select value={activeModel} onChange={(e) => handleModelOverride(e.target.value)}
            className="rounded-lg px-2 py-1 text-[10px] outline-none cursor-pointer"
            style={{ color: "rgba(244, 240, 234, 0.5)", background: "rgba(10, 22, 36, 0.6)", border: "1px solid rgba(200, 169, 126, 0.1)" }}
          >
            {models.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
          <select value={activeTTS} onChange={(e) => handleTTSOverride(e.target.value)}
            className="rounded-lg px-2 py-1 text-[10px] outline-none cursor-pointer"
            style={{ color: "rgba(244, 240, 234, 0.5)", background: "rgba(10, 22, 36, 0.6)", border: "1px solid rgba(200, 169, 126, 0.1)" }}
          >
            {ttsProviders.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
      )}
    </div>
  );
}
