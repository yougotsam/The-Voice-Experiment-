"use client";

import type { Metrics } from "@/types";

type MetricsOverlayProps = {
  metrics: Metrics | null;
};

function badge(label: string, value: number) {
  const tier = value < 300 ? "good" : value < 800 ? "ok" : "slow";
  const classes = {
    good: "text-[rgba(126,200,160,0.8)] border-[rgba(126,200,160,0.25)]",
    ok: "text-[rgba(226,198,126,0.8)] border-[rgba(226,198,126,0.25)]",
    slow: "text-[rgba(200,126,126,0.7)] border-[rgba(200,126,126,0.2)]",
  };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] font-mono tracking-wide border bg-slate-navy/40 ${classes[tier]}`}>
      {label}{" "}
      <strong>{value}</strong>ms
    </span>
  );
}

export function MetricsOverlay({ metrics }: MetricsOverlayProps) {
  if (!metrics) return null;

  return (
    <div className="flex flex-wrap justify-center gap-2">
      {badge("LLM", metrics.llm_ttfb_ms)}
      {badge("TTS", metrics.tts_ttfb_ms)}
      {badge("Total", metrics.total_ms)}
    </div>
  );
}
