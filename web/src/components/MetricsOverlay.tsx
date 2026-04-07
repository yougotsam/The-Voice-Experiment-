"use client";

import type { Metrics } from "@/types";

type MetricsOverlayProps = {
  metrics: Metrics | null;
};

function metricColor(ms: number): string {
  if (ms < 300) return "var(--color-text-primary)";
  if (ms < 800) return "var(--color-accent-bright)";
  return "#FCA5A5";
}

export function MetricsOverlay({ metrics }: MetricsOverlayProps) {
  if (!metrics) return null;

  const items = [
    { label: "LLM", value: metrics.llm_ttfb_ms },
    { label: "TTS", value: metrics.tts_ttfb_ms },
    { label: "Total", value: metrics.total_ms },
  ];

  return (
    <div className="flex items-center justify-center gap-1 text-[11px] font-mono" style={{ fontFeatureSettings: '"tnum"' }}>
      {items.map((item, i) => (
        <span key={item.label} className="inline-flex items-center gap-1">
          {i > 0 && <span className="text-text-muted mx-1">·</span>}
          <span className="text-text-tertiary">{item.label}</span>
          <span style={{ color: metricColor(item.value) }}>{item.value}</span>
          <span className="text-text-muted">ms</span>
        </span>
      ))}
    </div>
  );
}
