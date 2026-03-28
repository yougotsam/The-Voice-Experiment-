"use client";

import { useEffect, useRef } from "react";

export type TranscriptEntry = {
  role: "user" | "agent" | "tool" | "system";
  text: string;
  timestamp: number;
  toolName?: string;
  toolSuccess?: boolean;
};

type TranscriptPanelProps = {
  entries: TranscriptEntry[];
  partialTranscript: string;
};

export function TranscriptPanel({
  entries,
  partialTranscript,
}: TranscriptPanelProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [entries, partialTranscript]);

  if (entries.length === 0 && !partialTranscript) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3">
        <div className="h-10 w-10 rounded-full flex items-center justify-center"
          style={{ border: "1px solid rgba(200, 169, 126, 0.15)" }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" style={{ color: "rgba(200, 169, 126, 0.3)" }}>
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        </div>
        <p className="text-[11px] uppercase tracking-widest" style={{ color: "rgba(244, 240, 234, 0.25)" }}>
          No messages yet
        </p>
        <p className="text-xs text-center max-w-[240px]" style={{ color: "rgba(244, 240, 234, 0.15)" }}>
          Start talking or type a message to begin
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="max-h-80 space-y-3 overflow-y-auto pr-1">
        {entries.map((entry, i) => entry.role === "system" ? (
          <div key={i} className="flex justify-center py-1">
            <span
              className="rounded-full px-3 py-0.5 text-[9px] font-medium uppercase tracking-widest"
              style={{ color: "rgba(200, 169, 126, 0.6)", background: "rgba(200, 169, 126, 0.08)", border: "1px solid rgba(200, 169, 126, 0.15)" }}
            >
              {entry.text}
            </span>
          </div>
        ) : (
          <div key={i} className="flex gap-3">
            <div
              className="mt-1.5 h-1.5 w-1.5 rounded-full shrink-0"
              style={{
                background:
                  entry.role === "tool"
                    ? entry.toolSuccess === true ? "rgba(74, 222, 128, 0.6)"
                      : entry.toolSuccess === false ? "rgba(248, 113, 113, 0.6)"
                      : "rgba(200, 169, 126, 0.4)"
                    : entry.role === "user"
                      ? "rgba(200, 169, 126, 0.6)"
                      : "rgba(244, 240, 234, 0.3)",
              }}
            />
            <div className="flex-1 min-w-0">
              <span
                className="text-[10px] font-medium uppercase tracking-wider"
                style={{
                  color:
                    entry.role === "tool"
                      ? entry.toolSuccess === true ? "rgba(74, 222, 128, 0.7)"
                        : entry.toolSuccess === false ? "rgba(248, 113, 113, 0.7)"
                        : "rgba(200, 169, 126, 0.6)"
                      : entry.role === "user"
                        ? "rgba(200, 169, 126, 0.7)"
                        : "rgba(244, 240, 234, 0.35)",
                }}
              >
                {entry.role === "user" ? "You" : entry.role === "tool" ? (entry.toolName || "Tool") : "Agent"}
              </span>
              <p
                className="mt-0.5 text-sm leading-relaxed"
                style={{
                  color:
                    entry.role === "tool"
                      ? entry.toolSuccess === true ? "rgba(74, 222, 128, 0.7)"
                        : entry.toolSuccess === false ? "rgba(248, 113, 113, 0.7)"
                        : "rgba(244, 240, 234, 0.5)"
                      : entry.role === "user"
                        ? "rgba(244, 240, 234, 0.85)"
                        : "rgba(244, 240, 234, 0.7)",
                }}
              >
                {entry.text}
              </p>
            </div>
          </div>
        ))}
        {partialTranscript && (
          <div className="flex gap-3">
            <div
              className="mt-1.5 h-1.5 w-1.5 rounded-full shrink-0 animate-pulse"
              style={{ background: "rgba(200, 169, 126, 0.4)" }}
            />
            <div className="flex-1 min-w-0">
              <span
                className="text-[10px] font-medium uppercase tracking-wider"
                style={{ color: "rgba(200, 169, 126, 0.5)" }}
              >
                You
              </span>
              <p className="mt-0.5 text-sm leading-relaxed" style={{ color: "rgba(244, 240, 234, 0.5)" }}>
                {partialTranscript}
                <span className="animate-pulse">...</span>
              </p>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
