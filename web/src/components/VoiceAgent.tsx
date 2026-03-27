"use client";

import { useCallback, useRef, useState, useEffect } from "react";
import { useWebSocket, ServerMessage } from "@/hooks/useWebSocket";
import { useMicrophone } from "@/hooks/useMicrophone";
import { useAudioPlayback } from "@/hooks/useAudioPlayback";
import { useVAD } from "@/hooks/useVAD";
import { TranscriptPanel, TranscriptEntry } from "./TranscriptPanel";
import { MetricsOverlay } from "./MetricsOverlay";
import { PersonaSelector } from "./PersonaSelector";

type AgentState = "idle" | "listening" | "processing" | "speaking";
type InputMode = "push" | "vad";
type Metrics = { llm_ttfb_ms: number; tts_ttfb_ms: number; total_ms: number };

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000/ws";
const STUCK_TIMEOUT_MS = 30000;
const MAX_ENTRIES = 200;
const MAX_TEXT_INPUT = 2000;

export function VoiceAgent() {
  const [state, setState] = useState<AgentState>("idle");
  const [entries, setEntries] = useState<TranscriptEntry[]>([]);
  const [partial, setPartial] = useState("");
  const [connected, setConnected] = useState(false);
  const [inputMode, setInputMode] = useState<InputMode>("push");
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [textInput, setTextInput] = useState("");
  const agentTextBuffer = useRef("");
  const cappedSetEntries = useCallback(
    (updater: (prev: TranscriptEntry[]) => TranscriptEntry[]) => {
      setEntries((prev) => {
        const next = updater(prev);
        return next.length > MAX_ENTRIES ? next.slice(-MAX_ENTRIES) : next;
      });
    },
    [],
  );
  const stateRef = useRef<AgentState>("idle");
  const stuckTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const stopPlaybackRef = useRef<() => void>(() => {});
  const sendJSONRef = useRef<(msg: Record<string, unknown>) => void>(() => {});

  const setAgentState = useCallback((next: AgentState) => {
    setState(next);
    stateRef.current = next;
    clearTimeout(stuckTimer.current);
    if (next === "processing" || next === "speaking") {
      stuckTimer.current = setTimeout(() => {
        if (stateRef.current === next) {
          stopPlaybackRef.current();
          sendJSONRef.current({ type: "interrupt" });
          setState("idle");
          stateRef.current = "idle";
        }
      }, STUCK_TIMEOUT_MS);
    }
  }, []);

  useEffect(() => {
    return () => clearTimeout(stuckTimer.current);
  }, []);

  const { enqueue: enqueueAudio, stop: stopPlayback, setSampleRate } = useAudioPlayback();
  stopPlaybackRef.current = stopPlayback;

  const handleMessage = useCallback(
    (msg: ServerMessage) => {
      switch (msg.type) {
        case "transcript.partial":
          setPartial(msg.text || "");
          break;
        case "transcript.final":
          setPartial("");
          if (msg.text) {
            cappedSetEntries((prev) => [
              ...prev,
              { role: "user", text: msg.text!, timestamp: Date.now() },
            ]);
          }
          break;
        case "agent.text":
          agentTextBuffer.current += (agentTextBuffer.current ? " " : "") + (msg.text || "");
          cappedSetEntries((prev) => {
            const last = prev[prev.length - 1];
            if (last?.role === "agent") {
              return [
                ...prev.slice(0, -1),
                { ...last, text: agentTextBuffer.current },
              ];
            }
            return [
              ...prev,
              { role: "agent", text: agentTextBuffer.current, timestamp: Date.now() },
            ];
          });
          break;
        case "agent.audio.start":
          if (msg.sample_rate) setSampleRate(msg.sample_rate);
          setAgentState("speaking");
          break;
        case "agent.audio.end":
          break;
        case "metrics":
          setMetrics(msg as unknown as Metrics);
          break;
        case "status":
          if (msg.status === "idle") {
            setAgentState("idle");
            agentTextBuffer.current = "";
          } else if (msg.status === "processing") {
            setAgentState("processing");
          } else if (msg.status === "listening") {
            setAgentState("listening");
          }
          break;
        case "tool_call.start":
          cappedSetEntries((prev) => [
            ...prev,
            { role: "tool", text: `Calling ${msg.name}...`, timestamp: Date.now(), toolName: msg.name },
          ]);
          break;
        case "tool_call.result":
          cappedSetEntries((prev) => {
            const idx = [...prev].reverse().findIndex((e) => e.role === "tool" && e.toolName === msg.name);
            if (idx === -1) return prev;
            const realIdx = prev.length - 1 - idx;
            const updated = [...prev];
            updated[realIdx] = {
              ...updated[realIdx],
              text: msg.summary || "Done",
              toolSuccess: msg.success,
            };
            return updated;
          });
          break;
        case "persona.loaded":
          if (msg.greeting) {
            const greetingText = msg.greeting;
            cappedSetEntries((prev) => [
              ...prev,
              { role: "agent", text: greetingText, timestamp: Date.now() },
            ]);
          }
          break;
        case "error":
          console.error("Server error:", msg.text);
          stopPlayback();
          setAgentState("idle");
          break;
      }
    },
    [setSampleRate, setAgentState, stopPlayback, cappedSetEntries],
  );

  const handleBinary = useCallback(
    (data: ArrayBuffer) => {
      if (stateRef.current === "listening" || stateRef.current === "idle") return;
      if (stateRef.current !== "speaking") {
        setAgentState("speaking");
      }
      enqueueAudio(data);
    },
    [enqueueAudio, setAgentState],
  );

  const { sendJSON, sendBinary } = useWebSocket({
    url: WS_URL,
    onMessage: handleMessage,
    onBinary: handleBinary,
    onOpen: () => setConnected(true),
    onClose: () => {
      setConnected(false);
      stopPlayback();
      stopMicRef.current();
      setAgentState("idle");
    },
  });
  sendJSONRef.current = sendJSON;

  const { start: startMic, stop: stopMic } = useMicrophone(
    useCallback(
      (pcm16: ArrayBuffer) => {
        sendBinary(pcm16);
      },
      [sendBinary],
    ),
  );

  const stopMicRef = useRef(stopMic);
  stopMicRef.current = stopMic;

  const doInterrupt = useCallback(() => {
    stopPlayback();
    sendJSON({ type: "interrupt" });
  }, [stopPlayback, sendJSON]);

  const cleanupActiveSession = useCallback(() => {
    stopMic();
    if (stateRef.current === "listening") {
      sendJSON({ type: "stop" });
    }
    if (stateRef.current === "speaking" || stateRef.current === "processing") {
      doInterrupt();
    }
  }, [stopMic, sendJSON, doInterrupt]);

  const handlePushToTalk = useCallback(async () => {
    if (stateRef.current === "speaking" || stateRef.current === "processing") {
      doInterrupt();
    }
    stopPlayback();
    agentTextBuffer.current = "";
    await startMic();
    sendJSON({ type: "start" });
    setAgentState("listening");
  }, [startMic, sendJSON, stopPlayback, doInterrupt, setAgentState]);

  const handleRelease = useCallback(() => {
    if (stateRef.current === "listening") {
      stopMic();
      sendJSON({ type: "stop" });
      setAgentState("processing");
    }
  }, [stopMic, sendJSON, setAgentState]);

  const handlePersona = useCallback(
    (personaId: string) => {
      cleanupActiveSession();
      stopPlayback();
      agentTextBuffer.current = "";
      setAgentState("idle");
      sendJSON({ type: "config", persona_id: personaId });
      setEntries([]);
      setMetrics(null);
    },
    [sendJSON, cleanupActiveSession, stopPlayback, setAgentState],
  );

  const handleTextSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    const text = textInput.trim().slice(0, MAX_TEXT_INPUT);
    if (!text || !connected) return;
    if (stateRef.current === "speaking" || stateRef.current === "processing") {
      doInterrupt();
    }
    stopPlayback();
    agentTextBuffer.current = "";
    cappedSetEntries((prev) => [
      ...prev,
      { role: "user", text, timestamp: Date.now() },
    ]);
    sendJSON({ type: "text", text });
    setTextInput("");
    setAgentState("processing");
  }, [textInput, connected, sendJSON, doInterrupt, stopPlayback, setAgentState, cappedSetEntries]);

  const handleModeSwitch = useCallback(() => {
    cleanupActiveSession();
    stopPlayback();
    setAgentState("idle");
    setInputMode((m) => (m === "push" ? "vad" : "push"));
  }, [cleanupActiveSession, stopPlayback, setAgentState]);

  useVAD({
    enabled: inputMode === "vad" && connected,
    onSpeechStart: async () => {
      if (stateRef.current === "speaking" || stateRef.current === "processing") {
        doInterrupt();
      }
      stopPlayback();
      agentTextBuffer.current = "";
      await startMic();
      sendJSON({ type: "start" });
      setAgentState("listening");
    },
    onSpeechEnd: () => {
      if (stateRef.current === "listening") {
        stopMic();
        sendJSON({ type: "stop" });
        setAgentState("processing");
      }
    },
  });

  const stateConfig: Record<AgentState, { label: string; ringColor: string; orbColor: string; animate: string }> = {
    idle: {
      label: inputMode === "vad" ? "Listening" : "Ready",
      ringColor: "border-gold/20",
      orbColor: "bg-gradient-to-br from-twilight to-slate-navy",
      animate: "animate-breathe",
    },
    listening: {
      label: "Listening",
      ringColor: "border-gold/60",
      orbColor: "bg-gradient-to-br from-gold/30 to-twilight",
      animate: "animate-glow-pulse",
    },
    processing: {
      label: "Thinking",
      ringColor: "border-gold-light/40",
      orbColor: "bg-gradient-to-br from-gold-muted/30 to-twilight",
      animate: "animate-breathe",
    },
    speaking: {
      label: "Speaking",
      ringColor: "border-gold-light/70",
      orbColor: "bg-gradient-to-br from-gold/20 to-twilight",
      animate: "animate-glow-pulse",
    },
  };

  const cfg = stateConfig[state];

  return (
    <div className="flex w-full max-w-2xl flex-col items-center gap-6 relative z-10">
      <div className="flex flex-col items-center gap-1 mb-2">
        <h1 className="text-3xl font-heading font-semibold tracking-wide text-ivory">
          Voice Agent
        </h1>
        <div className="flex items-center gap-3 mt-2">
          <div className="flex items-center gap-1.5">
            <div className={`h-1.5 w-1.5 rounded-full transition-colors duration-500 ${connected ? "bg-gold shadow-[0_0_6px_rgba(200,169,126,0.5)]" : "bg-red-400/60"}`} />
            <span className="text-[10px] uppercase tracking-widest" style={{ color: "rgba(244, 240, 234, 0.4)" }}>
              {connected ? "Online" : "Offline"}
            </span>
          </div>
          <div className="w-px h-3" style={{ background: "rgba(200, 169, 126, 0.15)" }} />
          <button
            onClick={handleModeSwitch}
            className="text-[10px] uppercase tracking-widest px-2 py-0.5 rounded-full transition-all duration-300 hover:text-gold-light"
            style={{
              color: "rgba(244, 240, 234, 0.4)",
              border: "1px solid rgba(200, 169, 126, 0.15)",
            }}
          >
            {inputMode === "push" ? "Push to Talk" : "Hands Free"}
          </button>
        </div>
      </div>

      <PersonaSelector onSelect={handlePersona} />

      <div className="flex flex-col items-center gap-4 my-4">
        <div className="relative flex items-center justify-center">
          {state === "listening" && (
            <div className="absolute inset-0 rounded-full animate-pulse-ring" style={{
              border: "1px solid rgba(200, 169, 126, 0.2)",
              transform: "scale(1.3)",
            }} />
          )}
          <div className={`absolute inset-0 rounded-full ${cfg.ringColor} border-2 transition-all duration-700`}
            style={{ transform: "scale(1.15)" }}
          />

          {inputMode === "push" ? (
            <button
              onMouseDown={handlePushToTalk}
              onMouseUp={handleRelease}
              onMouseLeave={handleRelease}
              onTouchStart={handlePushToTalk}
              onTouchEnd={handleRelease}
              onKeyDown={(e) => {
                if (e.key === " " || e.key === "Enter") {
                  e.preventDefault();
                  handlePushToTalk();
                }
              }}
              onKeyUp={(e) => {
                if (e.key === " " || e.key === "Enter") {
                  e.preventDefault();
                  handleRelease();
                }
              }}
              disabled={!connected}
              className={`relative h-36 w-36 rounded-full flex flex-col items-center justify-center gap-2 transition-all duration-500 cursor-pointer select-none ${cfg.orbColor} ${cfg.animate} disabled:opacity-30 disabled:cursor-not-allowed`}
              style={{
                border: "1px solid rgba(200, 169, 126, 0.15)",
                boxShadow: state === "listening"
                  ? "0 0 60px rgba(200, 169, 126, 0.2), inset 0 0 30px rgba(200, 169, 126, 0.1)"
                  : "0 0 30px rgba(200, 169, 126, 0.08)",
              }}
            >
              <OrbIcon state={state} />
              <span className="text-[11px] font-medium tracking-wider uppercase" style={{ color: "rgba(244, 240, 234, 0.6)" }}>
                {cfg.label}
              </span>
            </button>
          ) : (
            <div
              className={`relative h-36 w-36 rounded-full flex flex-col items-center justify-center gap-2 transition-all duration-500 ${cfg.orbColor} ${cfg.animate}`}
              style={{
                border: "1px solid rgba(200, 169, 126, 0.15)",
                boxShadow: state === "speaking"
                  ? "0 0 60px rgba(200, 169, 126, 0.2), inset 0 0 30px rgba(200, 169, 126, 0.1)"
                  : "0 0 30px rgba(200, 169, 126, 0.08)",
              }}
            >
              <OrbIcon state={state} />
              <span className="text-[11px] font-medium tracking-wider uppercase" style={{ color: "rgba(244, 240, 234, 0.6)" }}>
                {cfg.label}
              </span>
            </div>
          )}
        </div>

        {(state === "speaking" || state === "processing") && (
          <button
            onClick={() => { doInterrupt(); setAgentState("idle"); }}
            className="px-5 py-1.5 rounded-full text-[11px] font-medium uppercase tracking-widest transition-all duration-300 hover:bg-gold/10"
            style={{
              color: "rgba(244, 240, 234, 0.5)",
              border: "1px solid rgba(200, 169, 126, 0.2)",
            }}
          >
            Interrupt
          </button>
        )}
      </div>

      <MetricsOverlay metrics={metrics} />

      <form onSubmit={handleTextSubmit} className="w-full flex gap-2">
        <input
          type="text"
          value={textInput}
          onChange={(e) => setTextInput(e.target.value)}
          placeholder="Type a message..."
          maxLength={MAX_TEXT_INPUT}
          disabled={!connected}
          className="flex-1 rounded-xl px-4 py-2.5 text-sm text-ivory placeholder:text-ivory/30 outline-none transition-all duration-300 focus:ring-1 focus:ring-gold/30 disabled:opacity-30"
          style={{
            background: "rgba(10, 22, 36, 0.6)",
            border: "1px solid rgba(200, 169, 126, 0.15)",
          }}
        />
        <button
          type="submit"
          disabled={!connected || !textInput.trim()}
          className="rounded-xl px-5 py-2.5 text-[11px] font-medium uppercase tracking-widest transition-all duration-300 hover:bg-gold/10 disabled:opacity-30 disabled:cursor-not-allowed"
          style={{
            color: "rgba(244, 240, 234, 0.7)",
            border: "1px solid rgba(200, 169, 126, 0.2)",
          }}
        >
          Send
        </button>
      </form>

      <TranscriptPanel entries={entries} partialTranscript={partial} />
    </div>
  );
}

function OrbIcon({ state }: { state: AgentState }) {
  if (state === "listening") {
    return (
      <div className="flex items-center gap-1">
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="w-[3px] rounded-full bg-gold-light"
            style={{
              height: `${12 + Math.sin(i * 1.2) * 8}px`,
              animation: `breathe ${0.6 + i * 0.1}s ease-in-out infinite`,
              opacity: 0.7,
            }}
          />
        ))}
      </div>
    );
  }

  if (state === "processing") {
    return (
      <div className="flex gap-1.5">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="w-1.5 h-1.5 rounded-full bg-gold-pale"
            style={{
              animation: `breathe 1s ease-in-out ${i * 0.2}s infinite`,
              opacity: 0.6,
            }}
          />
        ))}
      </div>
    );
  }

  if (state === "speaking") {
    return (
      <div className="flex items-center gap-[3px]">
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <div
            key={i}
            className="w-[2px] rounded-full bg-gold-light"
            style={{
              height: `${6 + Math.sin(i * 0.9) * 10}px`,
              animation: `breathe ${0.4 + i * 0.08}s ease-in-out infinite`,
              opacity: 0.6,
            }}
          />
        ))}
      </div>
    );
  }

  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: "rgba(200, 169, 126, 0.5)" }}>
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" x2="12" y1="19" y2="22" />
    </svg>
  );
}
