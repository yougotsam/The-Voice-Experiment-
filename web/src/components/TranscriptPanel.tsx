"use client";

import { useEffect, useRef } from "react";

export type TranscriptEntry = {
  role: "user" | "agent" | "tool";
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

  if (entries.length === 0 && !partialTranscript) return null;

  return (
    <div
      className="w-full rounded-2xl p-5 backdrop-blur-sm"
      style={{
        background: "rgba(10, 22, 36, 0.6)",
        border: "1px solid rgba(200, 169, 126, 0.1)",
      }}
    >
      <h2
        className="mb-4 text-[10px] font-medium uppercase tracking-[0.2em]"
        style={{ color: "rgba(200, 169, 126, 0.5)" }}
      >
        Conversation
      </h2>
      <div className="max-h-72 space-y-3 overflow-y-auto pr-1">
        {entries.map((entry, i) => (
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
