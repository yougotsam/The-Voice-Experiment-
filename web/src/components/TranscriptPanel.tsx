"use client";

import { useEffect, useRef, useCallback, useState, useMemo } from "react";
import type { StagingEntry } from "./StagingArea";

export type TranscriptEntry = {
  role: "user" | "agent" | "tool" | "system";
  text: string;
  timestamp: number;
  toolName?: string;
  toolSuccess?: boolean;
};

type FeedItem =
  | { kind: "transcript"; entry: TranscriptEntry; ts: number }
  | { kind: "staging"; entry: StagingEntry; ts: number };

type TranscriptPanelProps = {
  entries: TranscriptEntry[];
  partialTranscript: string;
  stagingEntries?: StagingEntry[];
};

function formatRelativeTime(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 5) return "now";
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  return `${Math.floor(diff / 3600)}h`;
}

export function TranscriptPanel({
  entries,
  partialTranscript,
  stagingEntries = [],
}: TranscriptPanelProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [, setTick] = useState(0);

  useEffect(() => {
    const iv = setInterval(() => setTick((t) => t + 1), 15000);
    return () => clearInterval(iv);
  }, []);

  const isNearBottom = useCallback(() => {
    const el = scrollRef.current?.parentElement;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }, []);

  useEffect(() => {
    if (isNearBottom()) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [entries, partialTranscript, stagingEntries, isNearBottom]);

  useEffect(() => {
    const el = scrollRef.current?.parentElement;
    if (!el) return;
    const handler = () => setShowScrollBtn(!isNearBottom());
    el.addEventListener("scroll", handler, { passive: true });
    return () => el.removeEventListener("scroll", handler);
  }, [isNearBottom]);

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

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

  const feed: FeedItem[] = useMemo(
    () =>
      [
        ...entries.map((e) => ({ kind: "transcript" as const, entry: e, ts: e.timestamp })),
        ...stagingEntries.map((e) => ({ kind: "staging" as const, entry: e, ts: e.timestamp })),
      ].sort((a, b) => a.ts - b.ts),
    [entries, stagingEntries],
  );

  if (feed.length === 0 && !partialTranscript) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3">
        <div className="h-12 w-12 rounded-full flex items-center justify-center border border-accent-default/15 bg-accent-default/[0.03]">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="text-accent-default/30">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        </div>
        <p className="text-[11px] uppercase tracking-widest text-text-muted">
          No messages yet
        </p>
        <p className="text-[10px] text-center max-w-[220px] text-text-muted leading-relaxed">
          Press the orb or type below to start a conversation
        </p>
      </div>
    );
  }

  return (
    <div className="relative" ref={scrollRef}>
      <div className="space-y-3 pr-1">
        {feed.map((item) => {
          if (item.kind === "staging") {
            const s = item.entry;
            const isCopied = copiedId === s.id;
            return (
              <div
                key={s.id}
                className="rounded-xl p-3 border border-accent-default/15 bg-accent-default/[0.04] transition-colors hover:bg-accent-default/[0.06]"
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[9px] font-medium uppercase tracking-wider text-accent-default/70">
                    {s.type} Draft
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] text-text-muted font-mono">{formatRelativeTime(s.timestamp)}</span>
                    <button
                      type="button"
                      onClick={() => handleCopy(s.content, s.id)}
                      className="text-[9px] uppercase tracking-wider px-2 py-0.5 rounded-full transition-all hover:bg-gold/10 border border-accent-default/15 text-accent-muted"
                    >
                      {isCopied ? "Copied ✓" : "Copy"}
                    </button>
                  </div>
                </div>
                <p className="text-xs font-medium mb-1 text-text-primary/80">
                  {s.title}
                </p>
                <p className="text-[11px] leading-relaxed whitespace-pre-wrap text-text-secondary">
                  {s.content}
                </p>
              </div>
            );
          }

          const entry = item.entry;
          if (entry.role === "system") {
            return (
              <div key={`${entry.role}-${entry.timestamp}`} className="flex justify-center py-1">
                <span
                  className="rounded-full px-3 py-0.5 text-[9px] font-medium uppercase tracking-widest text-accent-muted border border-accent-default/15 bg-accent-default/[0.08]"
                >
                  {entry.text}
                </span>
              </div>
            );
          }

          return (
            <div key={`${entry.role}-${entry.timestamp}`} className="group flex gap-3">
              <div
                className="mt-1.5 h-1.5 w-1.5 rounded-full shrink-0"
                style={{
                  background:
                    entry.role === "tool"
                      ? entry.toolSuccess === true ? "rgba(74, 222, 128, 0.6)"
                        : entry.toolSuccess === false ? "rgba(248, 113, 113, 0.6)"
                        : "var(--color-accent-muted)"
                      : entry.role === "user"
                        ? "rgba(200, 169, 126, 0.6)"
                        : "var(--color-text-tertiary)",
                }}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2">
                  <span
                    className="text-[10px] font-medium uppercase tracking-wider"
                    style={{
                      color:
                        entry.role === "tool"
                          ? entry.toolSuccess === true ? "rgba(74, 222, 128, 0.7)"
                            : entry.toolSuccess === false ? "rgba(248, 113, 113, 0.7)"
                            : "var(--color-accent-muted)"
                          : entry.role === "user"
                            ? "rgba(200, 169, 126, 0.7)"
                            : "var(--color-text-tertiary)",
                    }}
                  >
                    {entry.role === "user" ? "You" : entry.role === "tool" ? (entry.toolName || "Tool") : "Agent"}
                  </span>
                  <span className="text-[9px] font-mono text-text-muted opacity-0 group-hover:opacity-100 transition-opacity">
                    {formatRelativeTime(entry.timestamp)}
                  </span>
                </div>
                <p
                  className="mt-0.5 text-sm leading-relaxed"
                  style={{
                    color:
                      entry.role === "tool"
                        ? entry.toolSuccess === true ? "rgba(74, 222, 128, 0.7)"
                          : entry.toolSuccess === false ? "rgba(248, 113, 113, 0.7)"
                          : "var(--color-text-secondary)"
                        : entry.role === "user"
                          ? "var(--color-text-primary)"
                          : "var(--color-text-secondary)",
                  }}
                >
                  {entry.text}
                </p>
              </div>
            </div>
          );
        })}
        {partialTranscript && (
          <div className="flex gap-3">
            <div
              className="mt-1.5 h-1.5 w-1.5 rounded-full shrink-0 animate-pulse"
              style={{ background: "var(--color-accent-muted)" }}
            />
            <div className="flex-1 min-w-0">
              <span className="text-[10px] font-medium uppercase tracking-wider text-accent-muted">
                You
              </span>
              <p className="mt-0.5 text-sm leading-relaxed text-text-secondary">
                {partialTranscript}
                <span className="animate-pulse">...</span>
              </p>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
      {showScrollBtn && (
        <button type="button" onClick={scrollToBottom} className="scroll-to-bottom">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="inline mr-1">
            <polyline points="6 9 12 15 18 9" />
          </svg>
          New messages
        </button>
      )}
    </div>
  );
}
