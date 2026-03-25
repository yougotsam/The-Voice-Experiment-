"use client";

type Metrics = {
  llm_ttfb_ms: number;
  tts_ttfb_ms: number;
  total_ms: number;
};

type MetricsOverlayProps = {
  metrics: Metrics | null;
};

function badge(label: string, value: number) {
  const color =
    value < 300
      ? "text-green-400 border-green-800"
      : value < 800
        ? "text-yellow-400 border-yellow-800"
        : "text-red-400 border-red-800";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-mono ${color}`}
    >
      {label}{" "}
      <strong>{value}</strong>ms
    </span>
  );
}

export function MetricsOverlay({ metrics }: MetricsOverlayProps) {
  if (!metrics) return null;

  return (
    <div className="mt-3 flex flex-wrap justify-center gap-2">
      {badge("LLM", metrics.llm_ttfb_ms)}
      {badge("TTS", metrics.tts_ttfb_ms)}
      {badge("Total", metrics.total_ms)}
    </div>
  );
}
