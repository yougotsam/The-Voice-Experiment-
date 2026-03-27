"use client";

import { useRef, useEffect } from "react";

export type StagingEntry = {
  id: string;
  type: string;
  title: string;
  content: string;
  timestamp: number;
};

type StagingAreaProps = {
  entries: StagingEntry[];
};

export function StagingArea({ entries }: StagingAreaProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [entries]);

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3">
        <div className="h-10 w-10 rounded-full flex items-center justify-center"
          style={{ border: "1px solid rgba(200, 169, 126, 0.15)" }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" style={{ color: "rgba(200, 169, 126, 0.3)" }}>
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
            <path d="M14 2v6h6" />
            <line x1="16" x2="8" y1="13" y2="13" />
            <line x1="16" x2="8" y1="17" y2="17" />
          </svg>
        </div>
        <p className="text-[11px] uppercase tracking-widest" style={{ color: "rgba(244, 240, 234, 0.25)" }}>
          No drafts yet
        </p>
        <p className="text-xs text-center max-w-[240px]" style={{ color: "rgba(244, 240, 234, 0.15)" }}>
          Ask the agent to draft content and it will appear here for review
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
      {entries.map((entry) => (
        <div
          key={entry.id}
          className="rounded-xl p-4"
          style={{
            background: "rgba(18, 34, 54, 0.4)",
            border: "1px solid rgba(200, 169, 126, 0.08)",
          }}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-medium uppercase tracking-wider"
              style={{ color: "rgba(200, 169, 126, 0.6)" }}
            >
              {entry.type}
            </span>
            <span className="text-[10px]" style={{ color: "rgba(244, 240, 234, 0.2)" }}>
              {new Date(entry.timestamp).toLocaleTimeString()}
            </span>
          </div>
          <h3 className="text-sm font-medium mb-1.5" style={{ color: "rgba(244, 240, 234, 0.8)" }}>
            {entry.title}
          </h3>
          <p className="text-xs leading-relaxed whitespace-pre-wrap" style={{ color: "rgba(244, 240, 234, 0.55)" }}>
            {entry.content}
          </p>
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
