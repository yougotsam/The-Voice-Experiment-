"use client";

import { useCallback, useEffect, useState } from "react";

export type SessionAnalytics = {
  session_duration_s: number;
  message_count: number;
  avg_llm_ttfb_ms: number;
  avg_tts_ttfb_ms: number;
  avg_total_ms: number;
  latency_history: { llm: number; tts: number; total: number }[];
  tool_calls_success: number;
  tool_calls_failed: number;
  tool_usage: Record<string, number>;
  persona_usage: Record<string, number>;
};

type BusinessMetrics = {
  total_contacts: number;
  pipeline: {
    total_opportunities: number;
    total_value: number;
    won: number;
    lost: number;
    open: number;
    win_rate: number;
  };
};

type AnalyticsPanelProps = {
  sessionMetrics: SessionAnalytics | null;
};

type AnalyticsView = "session" | "business";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

function StatCard({ label, value, unit, color }: { label: string; value: string | number; unit?: string; color?: string }) {
  return (
    <div
      className="flex flex-col items-center gap-1 rounded-xl px-4 py-3 min-w-[100px]"
      style={{ background: "rgba(10, 22, 36, 0.5)", border: "1px solid rgba(200, 169, 126, 0.1)" }}
    >
      <span className="text-[9px] uppercase tracking-widest" style={{ color: "rgba(244, 240, 234, 0.35)" }}>
        {label}
      </span>
      <span className="text-lg font-semibold" style={{ color: color || "#E2C69D" }}>
        {value}
        {unit && <span className="text-[10px] ml-0.5 font-normal" style={{ color: "rgba(244, 240, 234, 0.3)" }}>{unit}</span>}
      </span>
    </div>
  );
}

function latencyColor(ms: number): string {
  if (ms < 300) return "#6EE7B7";
  if (ms < 800) return "#FCD34D";
  return "#FCA5A5";
}

function Sparkline({ data, height = 48 }: { data: number[]; height?: number }) {
  if (data.length < 2) return null;
  const max = Math.max(...data, 1);
  const w = 200;
  const points = data.map((v, i) => `${(i / (data.length - 1)) * w},${height - (v / max) * (height - 4)}`).join(" ");
  return (
    <svg width={w} height={height} viewBox={`0 0 ${w} ${height}`} className="mx-auto">
      <polyline points={points} fill="none" stroke="#C8A97E" strokeWidth="1.5" strokeLinejoin="round" />
      {data.map((v, i) => (
        <circle
          key={i}
          cx={(i / (data.length - 1)) * w}
          cy={height - (v / max) * (height - 4)}
          r="2"
          fill={latencyColor(v)}
        />
      ))}
    </svg>
  );
}

function ToolUsageBar({ usage }: { usage: Record<string, number> }) {
  const entries = Object.entries(usage).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) return null;
  const max = entries[0][1] || 1;
  return (
    <div className="flex flex-col gap-1.5 w-full">
      {entries.map(([name, count]) => (
        <div key={name} className="flex items-center gap-2">
          <span className="text-[10px] w-28 truncate text-right" style={{ color: "rgba(244, 240, 234, 0.4)" }}>
            {name}
          </span>
          <div className="flex-1 h-3 rounded-full overflow-hidden" style={{ background: "rgba(10, 22, 36, 0.6)" }}>
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${(count / max) * 100}%`, background: "rgba(200, 169, 126, 0.4)" }}
            />
          </div>
          <span className="text-[10px] w-6 text-right" style={{ color: "rgba(244, 240, 234, 0.5)" }}>
            {count}
          </span>
        </div>
      ))}
    </div>
  );
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
}

function SessionView({ metrics }: { metrics: SessionAnalytics | null }) {
  if (!metrics || metrics.message_count === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 gap-2">
        <p className="text-[11px] uppercase tracking-widest" style={{ color: "rgba(244, 240, 234, 0.25)" }}>
          No session data yet
        </p>
        <p className="text-xs text-center max-w-[240px]" style={{ color: "rgba(244, 240, 234, 0.15)" }}>
          Start a conversation to see metrics
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap justify-center gap-2">
        <StatCard label="Messages" value={metrics.message_count} />
        <StatCard label="Duration" value={formatDuration(metrics.session_duration_s)} />
        <StatCard label="Avg Response" value={metrics.avg_total_ms} unit="ms" color={latencyColor(metrics.avg_total_ms)} />
      </div>

      <div className="flex flex-wrap justify-center gap-2">
        <StatCard label="LLM TTFB" value={metrics.avg_llm_ttfb_ms} unit="ms" color={latencyColor(metrics.avg_llm_ttfb_ms)} />
        <StatCard label="TTS TTFB" value={metrics.avg_tts_ttfb_ms} unit="ms" color={latencyColor(metrics.avg_tts_ttfb_ms)} />
        <StatCard label="Tool Calls" value={`${metrics.tool_calls_success}/${metrics.tool_calls_success + metrics.tool_calls_failed}`} />
      </div>

      {metrics.latency_history.length >= 2 && (
        <div className="flex flex-col items-center gap-1">
          <span className="text-[9px] uppercase tracking-widest" style={{ color: "rgba(244, 240, 234, 0.25)" }}>
            Response Time Trend
          </span>
          <Sparkline data={metrics.latency_history.map((h) => h.total)} />
        </div>
      )}

      {Object.keys(metrics.tool_usage).length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="text-[9px] uppercase tracking-widest text-center" style={{ color: "rgba(244, 240, 234, 0.25)" }}>
            Tool Usage
          </span>
          <ToolUsageBar usage={metrics.tool_usage} />
        </div>
      )}
    </div>
  );
}

function BusinessView() {
  const [data, setData] = useState<BusinessMetrics | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await fetch(`${API_BASE}/api/analytics/business`);
      if (resp.ok) setData(await resp.json());
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading && !data) {
    return (
      <div className="flex justify-center py-10">
        <span className="text-[11px] uppercase tracking-widest" style={{ color: "rgba(244, 240, 234, 0.25)" }}>
          Loading...
        </span>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center py-10 gap-2">
        <p className="text-[11px] uppercase tracking-widest" style={{ color: "rgba(244, 240, 234, 0.25)" }}>
          GHL not connected
        </p>
        <p className="text-xs text-center max-w-[240px]" style={{ color: "rgba(244, 240, 234, 0.15)" }}>
          Configure GHL credentials to see business metrics
        </p>
      </div>
    );
  }

  const p = data.pipeline;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap justify-center gap-2">
        <StatCard label="Contacts" value={data.total_contacts} />
        <StatCard label="Opportunities" value={p.total_opportunities} />
        <StatCard label="Pipeline Value" value={`$${p.total_value.toLocaleString()}`} />
      </div>

      <div className="flex flex-wrap justify-center gap-2">
        <StatCard label="Won" value={p.won} color="#6EE7B7" />
        <StatCard label="Lost" value={p.lost} color="#FCA5A5" />
        <StatCard label="Open" value={p.open} color="#FCD34D" />
        <StatCard label="Win Rate" value={`${p.win_rate}%`} color={p.win_rate >= 50 ? "#6EE7B7" : "#FCD34D"} />
      </div>
    </div>
  );
}

export function AnalyticsPanel({ sessionMetrics }: AnalyticsPanelProps) {
  const [view, setView] = useState<AnalyticsView>("session");

  const views: { id: AnalyticsView; label: string }[] = [
    { id: "session", label: "Session" },
    { id: "business", label: "Business" },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-center gap-1">
        {views.map((v) => (
          <button
            key={v.id}
            onClick={() => setView(v.id)}
            className="rounded-full px-3.5 py-1 text-[10px] font-medium tracking-wide transition-all duration-300"
            style={
              view === v.id
                ? { color: "#E2C69D", background: "rgba(200, 169, 126, 0.12)", border: "1px solid rgba(200, 169, 126, 0.3)" }
                : { color: "rgba(244, 240, 234, 0.35)", background: "transparent", border: "1px solid rgba(200, 169, 126, 0.08)" }
            }
          >
            {v.label}
          </button>
        ))}
      </div>

      {view === "session" && <SessionView metrics={sessionMetrics} />}
      {view === "business" && <BusinessView />}
    </div>
  );
}
