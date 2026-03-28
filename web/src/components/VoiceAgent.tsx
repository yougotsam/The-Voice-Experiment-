"use client";

import { useCallback, useRef, useState, useEffect, useMemo } from "react";
import { useWebSocket, ServerMessage } from "@/hooks/useWebSocket";
import { useMicrophone } from "@/hooks/useMicrophone";
import { useAudioPlayback } from "@/hooks/useAudioPlayback";
import { useVAD } from "@/hooks/useVAD";
import { TranscriptPanel, TranscriptEntry } from "./TranscriptPanel";
import { MetricsOverlay } from "./MetricsOverlay";
import { PersonaSelector } from "./PersonaSelector";
import { VoiceOrb } from "./VoiceOrb";
import { TabPanel } from "./TabPanel";
import { StagingArea, StagingEntry } from "./StagingArea";
import { CRMPanel } from "./CRMPanel";
import { ProviderSelectors } from "./ProviderSelectors";
import type { AgentState, InputMode, Metrics } from "@/types";

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000/ws";
const STUCK_TIMEOUT_MS = 30000;
const MAX_ENTRIES = 200;
const MAX_TEXT_INPUT = 2000;
const MAX_STAGING_ENTRIES = 50;

export function VoiceAgent() {
  const [state, setState] = useState<AgentState>("idle");
  const [entries, setEntries] = useState<TranscriptEntry[]>([]);
  const [partial, setPartial] = useState("");
  const [connected, setConnected] = useState(false);
  const [inputMode, setInputMode] = useState<InputMode>("push");
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [textInput, setTextInput] = useState("");
  const [stagingEntries, setStagingEntries] = useState<StagingEntry[]>([]);
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
          if (msg.name === "draft_content" && msg.success) {
            const args = msg.arguments ?? {};
            const draftType = String(args.content_type || "content");
            const draftTopic = String(args.topic || "Untitled");
            setStagingEntries((prev) => {
              const next = [
                ...prev,
                {
                  id: `draft-${Date.now()}`,
                  type: "Draft",
                  title: `${draftType.charAt(0).toUpperCase() + draftType.slice(1)}: ${draftTopic}`,
                  content: msg.summary || "",
                  timestamp: Date.now(),
                },
              ];
              return next.length > MAX_STAGING_ENTRIES ? next.slice(-MAX_STAGING_ENTRIES) : next;
            });
          }
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
        case "model.loaded":
          console.log("[Provider] LLM switched to:", msg.name);
          break;
        case "tts.loaded":
          console.log("[Provider] TTS switched to:", (msg as Record<string, unknown>).provider);
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
      setStagingEntries([]);
      setMetrics(null);
    },
    [sendJSON, cleanupActiveSession, stopPlayback, setAgentState],
  );

  const handleModelChange = useCallback(
    (modelId: string) => {
      sendJSON({ type: "config", model_id: modelId });
    },
    [sendJSON],
  );

  const handleTTSChange = useCallback(
    (providerId: string) => {
      sendJSON({ type: "config", tts_provider: providerId });
    },
    [sendJSON],
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

  const stateLabels: Record<AgentState, string> = {
    idle: inputMode === "vad" ? "Listening" : "Ready",
    listening: "Listening",
    processing: "Thinking",
    speaking: "Speaking",
  };

  const tabs = useMemo(() => [
    { id: "transcript", label: "Transcript", badge: entries.length || undefined },
    { id: "staging", label: "Staging", badge: stagingEntries.length || undefined },
    { id: "crm", label: "CRM" },
    { id: "analytics", label: "Analytics" },
  ], [entries.length, stagingEntries.length]);

  return (
    <div className="flex w-full max-w-2xl flex-col items-center gap-5 relative z-10">
      <div className="flex flex-col items-center gap-1">
        <h1 className="text-3xl font-heading font-semibold tracking-wide text-ivory">
          ZeebsOS
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
            type="button"
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
      <ProviderSelectors onModelChange={handleModelChange} onTTSChange={handleTTSChange} />

      <div className="flex flex-col items-center gap-3">
        <VoiceOrb
          state={state}
          label={stateLabels[state]}
          connected={connected}
          inputMode={inputMode}
          onPushStart={handlePushToTalk}
          onPushEnd={handleRelease}
        />

        {(state === "speaking" || state === "processing") && (
          <button
            type="button"
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

        <MetricsOverlay metrics={metrics} />
      </div>

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

      <TabPanel tabs={tabs} defaultTab="transcript">
        {{
          transcript: <TranscriptPanel entries={entries} partialTranscript={partial} />,
          staging: <StagingArea entries={stagingEntries} />,
          crm: <CRMPanel />,
          analytics: (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <div className="h-10 w-10 rounded-full flex items-center justify-center"
                style={{ border: "1px solid rgba(200, 169, 126, 0.15)" }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" style={{ color: "rgba(200, 169, 126, 0.3)" }}>
                  <path d="M3 3v18h18" />
                  <path d="m19 9-5 5-4-4-3 3" />
                </svg>
              </div>
              <p className="text-[11px] uppercase tracking-widest" style={{ color: "rgba(244, 240, 234, 0.25)" }}>
                Analytics
              </p>
              <p className="text-xs text-center max-w-[240px]" style={{ color: "rgba(244, 240, 234, 0.15)" }}>
                Session metrics and usage insights coming soon
              </p>
            </div>
          ),
        }}
      </TabPanel>
    </div>
  );
}


