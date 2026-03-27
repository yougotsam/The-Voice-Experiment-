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
      ? "rgba(200, 169, 126, 0.7)"
      : value < 800
        ? "rgba(226, 198, 157, 0.6)"
        : "rgba(158, 130, 90, 0.5)";
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] font-mono tracking-wide"
      style={{
        color,
        border: `1px solid ${color.replace(/[\d.]+\)$/, "0.2)")}`,
        background: "rgba(10, 22, 36, 0.4)",
      }}
    >
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
