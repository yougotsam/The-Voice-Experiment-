"use client";

import { useEffect, useRef } from "react";

export type TranscriptEntry = {
  role: "user" | "agent";
  text: string;
  timestamp: number;
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

  return (
    <div className="mt-6 w-full max-w-lg rounded-xl border border-gray-800 bg-gray-900/50 p-4">
      <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-gray-500">
        Transcript
      </h2>
      <div className="max-h-64 space-y-2 overflow-y-auto">
        {entries.map((entry, i) => (
          <div
            key={i}
            className={`rounded-lg px-3 py-2 text-sm ${
              entry.role === "user"
                ? "bg-blue-900/30 text-blue-200"
                : "bg-gray-800/50 text-gray-200"
            }`}
          >
            <span className="mr-2 text-xs font-semibold uppercase text-gray-500">
              {entry.role === "user" ? "You" : "Agent"}
            </span>
            {entry.text}
          </div>
        ))}
        {partialTranscript && (
          <div className="rounded-lg bg-blue-900/20 px-3 py-2 text-sm text-blue-300 opacity-70">
            <span className="mr-2 text-xs font-semibold uppercase text-gray-500">
              You
            </span>
            {partialTranscript}...
          </div>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
