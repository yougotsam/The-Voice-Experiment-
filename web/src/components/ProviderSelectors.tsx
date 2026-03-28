"use client";

import { useCallback, useEffect, useState } from "react";

type ProviderOption = {
  id: string;
  name: string;
};

type ProviderSelectorsProps = {
  onModelChange: (modelId: string) => void;
  onTTSChange: (providerId: string) => void;
};

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export function ProviderSelectors({ onModelChange, onTTSChange }: ProviderSelectorsProps) {
  const [models, setModels] = useState<ProviderOption[]>([]);
  const [ttsProviders, setTTSProviders] = useState<ProviderOption[]>([]);
  const [activeModel, setActiveModel] = useState("");
  const [activeTTS, setActiveTTS] = useState("");

  useEffect(() => {
    fetch(`${API_BASE}/api/providers/models`)
      .then((r) => r.json())
      .then((data) => {
        const list = data.models || [];
        setModels(list);
        if (list.length > 0 && !activeModel) setActiveModel(list[0].id);
      })
      .catch(() => {});

    fetch(`${API_BASE}/api/providers/tts`)
      .then((r) => r.json())
      .then((data) => {
        const list = data.providers || [];
        setTTSProviders(list);
        if (list.length > 0 && !activeTTS) setActiveTTS(list[0].id);
      })
      .catch(() => {});
  }, []);

  const handleModelChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const id = e.target.value;
      setActiveModel(id);
      onModelChange(id);
    },
    [onModelChange],
  );

  const handleTTSChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const id = e.target.value;
      setActiveTTS(id);
      onTTSChange(id);
    },
    [onTTSChange],
  );

  const selectStyle: React.CSSProperties = {
    color: "rgba(244, 240, 234, 0.6)",
    background: "rgba(10, 22, 36, 0.6)",
    border: "1px solid rgba(200, 169, 126, 0.15)",
  };

  return (
    <div className="flex flex-wrap justify-center gap-2">
      {models.length > 0 && (
        <div className="flex items-center gap-1.5">
          <span
            className="text-[9px] uppercase tracking-widest"
            style={{ color: "rgba(244, 240, 234, 0.3)" }}
          >
            LLM
          </span>
          <select
            value={activeModel}
            onChange={handleModelChange}
            className="rounded-full px-3 py-1 text-[11px] tracking-wide outline-none cursor-pointer transition-all duration-300 focus:ring-1 focus:ring-gold/30"
            style={selectStyle}
          >
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {ttsProviders.length > 0 && (
        <div className="flex items-center gap-1.5">
          <span
            className="text-[9px] uppercase tracking-widest"
            style={{ color: "rgba(244, 240, 234, 0.3)" }}
          >
            Voice
          </span>
          <select
            value={activeTTS}
            onChange={handleTTSChange}
            className="rounded-full px-3 py-1 text-[11px] tracking-wide outline-none cursor-pointer transition-all duration-300 focus:ring-1 focus:ring-gold/30"
            style={selectStyle}
          >
            {ttsProviders.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
