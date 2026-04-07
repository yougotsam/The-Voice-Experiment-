"use client";

import { useRef, useEffect, useCallback, useState } from "react";

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
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [entries]);

  const handleCopy = useCallback(async (text: string, id: string) => {
    if (!navigator?.clipboard?.writeText) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch {
      // silently fail
    }
  }, []);

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3">
        <div className="h-12 w-12 rounded-full flex items-center justify-center border border-accent-default/15 bg-accent-default/[0.03]">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="text-accent-default/30">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
            <path d="M14 2v6h6" />
            <line x1="16" x2="8" y1="13" y2="13" />
            <line x1="16" x2="8" y1="17" y2="17" />
          </svg>
        </div>
        <p className="text-[11px] uppercase tracking-widest text-text-muted">
          No drafts yet
        </p>
        <p className="text-[10px] text-center max-w-[220px] text-text-muted leading-relaxed">
          Ask the agent to draft content and it will appear here for review
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
      {entries.map((entry) => {
        const isCopied = copiedId === entry.id;
        return (
          <div
            key={entry.id}
            className="rounded-xl p-4 bg-surface-1 border border-white/[0.06] transition-all hover:border-white/[0.10] hover:shadow-[0_4px_16px_rgba(160,130,80,0.06)]"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="text-accent-default/40">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
                  <path d="M14 2v6h6" />
                </svg>
                <span className="text-[10px] font-medium uppercase tracking-wider text-accent-muted">
                  {entry.type}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[9px] text-text-muted font-mono">
                  {new Date(entry.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
                <button
                  type="button"
                  onClick={() => handleCopy(entry.content, entry.id)}
                  className="text-[9px] uppercase tracking-wider px-2 py-0.5 rounded-full transition-all hover:bg-gold/10 border border-accent-default/15 text-accent-muted"
                >
                  {isCopied ? "Copied ✓" : "Copy"}
                </button>
              </div>
            </div>
            <h3 className="text-sm font-medium mb-1.5 text-text-primary/80">
              {entry.title}
            </h3>
            <p className="text-xs leading-relaxed whitespace-pre-wrap text-text-secondary">
              {entry.content}
            </p>
          </div>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}
