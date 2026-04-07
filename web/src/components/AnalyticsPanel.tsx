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
  model_usage: Record<string, number>;
  agent_usage: Record<string, number>;
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
    <div className="flex flex-col items-center gap-1 rounded-xl px-4 py-3 min-w-[100px] bg-slate-navy/50 border border-accent-default/10">
      <span className="text-[9px] uppercase tracking-widest text-text-tertiary">
        {label}
      </span>
      <span className="text-lg font-semibold" style={{ color: color || "var(--color-accent-bright)" }}>
        {value}
        {unit && <span className="text-[10px] ml-0.5 font-normal text-text-tertiary">{unit}</span>}
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
          <span className="text-[10px] w-28 truncate text-right text-text-tertiary">
            {name}
          </span>
          <div className="flex-1 h-3 rounded-full overflow-hidden bg-surface-2">
            <div
              className="h-full rounded-full transition-all duration-500 bg-accent-default/40"
              style={{ width: `${(count / max) * 100}%` }}
            />
          </div>
          <span className="text-[10px] w-6 text-right text-text-secondary">
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
        <p className="text-[11px] uppercase tracking-widest text-text-muted">
          No session data yet
        </p>
        <p className="text-xs text-center max-w-[240px] text-text-muted">
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
          <span className="text-[9px] uppercase tracking-widest text-text-muted">
            Response Time Trend
          </span>
          <Sparkline data={metrics.latency_history.map((h) => h.total)} />
        </div>
      )}

      {Object.keys(metrics.tool_usage).length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="text-[9px] uppercase tracking-widest text-center text-text-muted">
            Tool Usage
          </span>
          <ToolUsageBar usage={metrics.tool_usage} />
        </div>
      )}

      {Object.keys(metrics.model_usage || {}).length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="text-[9px] uppercase tracking-widest text-center text-text-muted">
            Model Usage
          </span>
          <ToolUsageBar usage={metrics.model_usage} />
        </div>
      )}

      {Object.keys(metrics.agent_usage || {}).length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="text-[9px] uppercase tracking-widest text-center text-text-muted">
            Agent Routing
          </span>
          <ToolUsageBar usage={metrics.agent_usage} />
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
        <span className="text-[11px] uppercase tracking-widest text-text-muted">
          Loading...
        </span>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center py-10 gap-2">
        <p className="text-[11px] uppercase tracking-widest text-text-muted">
          GHL not connected
        </p>
        <p className="text-xs text-center max-w-[240px] text-text-muted">
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
            className={`rounded-full px-3.5 py-1 text-[10px] font-medium tracking-wide transition-all duration-300 border ${
              view === v.id
                ? "text-accent-bright bg-accent-default/12 border-accent-default/30"
                : "text-text-tertiary bg-transparent border-accent-default/8"
            }`}
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
