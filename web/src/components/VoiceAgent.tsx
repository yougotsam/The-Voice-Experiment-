"use client";

import { useCallback, useRef, useState, useEffect, useMemo } from "react";
import { useWebSocket, ServerMessage } from "@/hooks/useWebSocket";
import { useMicrophone } from "@/hooks/useMicrophone";
import { useAudioPlayback } from "@/hooks/useAudioPlayback";
import { useVAD } from "@/hooks/useVAD";
import { TranscriptPanel, TranscriptEntry } from "./TranscriptPanel";
import { MetricsOverlay } from "./MetricsOverlay";
import { VoiceOrb } from "./VoiceOrb";
import { CRMPanel } from "./CRMPanel";
import { EngineSelector } from "./EngineSelector";
import { AnalyticsPanel, type SessionAnalytics } from "./AnalyticsPanel";
import { PERSONAS } from "./PersonaSelector";
import type { StagingEntry } from "./StagingArea";
import type { AgentState, InputMode, Metrics } from "@/types";

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000/ws";
const STUCK_TIMEOUT_MS = 30000;
const MAX_ENTRIES = 200;
const MAX_TEXT_INPUT = 2000;
const MAX_STAGING_ENTRIES = 50;
const VAD_COOLDOWN_MS = 1200;

type MobileTab = "conversation" | "voice" | "intel";

export function VoiceAgent() {
  const [state, setState] = useState<AgentState>("idle");
  const [entries, setEntries] = useState<TranscriptEntry[]>([]);
  const [partial, setPartial] = useState("");
  const [connected, setConnected] = useState(false);
  const [inputMode, setInputMode] = useState<InputMode>("push");
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [textInput, setTextInput] = useState("");
  const [stagingEntries, setStagingEntries] = useState<StagingEntry[]>([]);
  const [sessionAnalytics, setSessionAnalytics] = useState<SessionAnalytics | null>(null);
  const [mobileTab, setMobileTab] = useState<MobileTab>("voice");
  const [activePersona, setActivePersona] = useState("default");
  const [intelTab, setIntelTab] = useState<"crm" | "analytics">("crm");
  const [crmRefreshKey, setCrmRefreshKey] = useState(0);
  const [serverConfig, setServerConfig] = useState<{ model_id: string; tts_provider: string } | null>(null);
  const agentTextBuffer = useRef("");
  const lastSpeakingEnd = useRef(0);
  const hasConnected = useRef(false);
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
          lastSpeakingEnd.current = Date.now();
          break;
        case "metrics":
          setMetrics(msg as unknown as Metrics);
          break;
        case "analytics":
          setSessionAnalytics(msg as unknown as SessionAnalytics);
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
        case "agent.routed":
          if (msg.name) {
            cappedSetEntries((prev) => [
              ...prev,
              { role: "system" as const, text: msg.name!, timestamp: Date.now() },
            ]);
          }
          break;
        case "webhook.event":
          if (msg.summary) {
            cappedSetEntries((prev) => [
              ...prev,
              { role: "system" as const, text: `[CRM] ${msg.summary}`, timestamp: Date.now() },
            ]);
          }
          if (msg.category === "contact" || msg.category === "opportunity" || msg.category === "message") {
            setCrmRefreshKey((k) => k + 1);
          }
          break;
        case "config.current":
          setServerConfig({ model_id: (msg as unknown as Record<string, string>).model_id, tts_provider: (msg as unknown as Record<string, string>).tts_provider });
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
      if (stateRef.current === "listening") return;
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
    onOpen: () => { hasConnected.current = true; setConnected(true); },
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
    try {
      await startMic();
    } catch {
      setAgentState("idle");
      return;
    }
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
      setActivePersona(personaId);
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

  const handleVoiceChange = useCallback(
    (voiceId: string) => {
      sendJSON({ type: "config", voice_id: voiceId });
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
      if (Date.now() - lastSpeakingEnd.current < VAD_COOLDOWN_MS) return;
      if (stateRef.current === "speaking" || stateRef.current === "processing") {
        doInterrupt();
      }
      stopPlayback();
      agentTextBuffer.current = "";
      try {
        await startMic();
      } catch {
        setAgentState("idle");
        return;
      }
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

  const mobileTabs: { id: MobileTab; label: string; icon: React.ReactNode }[] = useMemo(() => [
    {
      id: "conversation",
      label: "Chat",
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      ),
    },
    {
      id: "voice",
      label: "Voice",
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
          <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
          <line x1="12" x2="12" y1="19" y2="23" />
          <line x1="8" x2="16" y1="23" y2="23" />
        </svg>
      ),
    },
    {
      id: "intel",
      label: "Intel",
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          <path d="M18 20V10" /><path d="M12 20V4" /><path d="M6 20v-6" />
        </svg>
      ),
    },
  ], []);

  return (
    <div className="flex flex-col h-full overflow-hidden relative z-10">
      <div className="noise-overlay" />

      <header
        className="glass-panel flex items-center gap-3 px-4 py-2.5 shrink-0 z-20 rounded-none"
        style={{ borderTop: "none", borderLeft: "none", borderRight: "none" }}
      >
        <h1 className="text-lg font-heading font-semibold tracking-wide text-ivory shrink-0">
          ZeebsOS
        </h1>

        <div className="flex-1 flex items-center justify-center gap-2 min-w-0">
          <EngineSelector onModelChange={handleModelChange} onTTSChange={handleTTSChange} onVoiceChange={handleVoiceChange} serverConfig={serverConfig} />
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <select
            value={activePersona}
            onChange={(e) => handlePersona(e.target.value)}
            className="rounded-lg px-2.5 py-1.5 text-[11px] tracking-wide outline-none cursor-pointer transition-all duration-300 focus:ring-1 focus:ring-gold/30"
            style={{
              color: "rgba(226, 198, 157, 0.9)",
              background: "rgba(10, 22, 36, 0.6)",
              border: "1px solid rgba(200, 169, 126, 0.2)",
            }}
          >
            {PERSONAS.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>

          <div className="flex items-center gap-1.5">
            <div className={`h-1.5 w-1.5 rounded-full transition-colors duration-500 ${connected ? "bg-gold shadow-[0_0_6px_rgba(200,169,126,0.5)]" : "bg-red-400/60"}`} />
            <span className="text-[10px] uppercase tracking-widest hidden sm:inline" style={{ color: "rgba(244, 240, 234, 0.4)" }}>
              {connected ? "Online" : "Offline"}
            </span>
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <div
          className={`w-80 xl:w-[340px] shrink-0 flex-col glass-panel m-3 mr-1.5 rounded-2xl overflow-hidden ${mobileTab === "conversation" ? "flex" : "hidden"} lg:flex`}
        >
          <div
            className="px-4 py-3 flex items-center justify-between shrink-0"
            style={{ borderBottom: "1px solid rgba(200, 169, 126, 0.06)" }}
          >
            <span className="micro-label">Conversation</span>
            <span className="text-[10px] font-mono" style={{ color: "rgba(244, 240, 234, 0.2)" }}>
              {entries.length || ""}
            </span>
          </div>
          <div className="flex-1 overflow-y-auto p-3">
            <TranscriptPanel entries={entries} partialTranscript={partial} stagingEntries={stagingEntries} />
          </div>
        </div>

        <div
          className={`flex-1 flex-col items-center justify-center gap-5 p-6 min-w-0 relative ${mobileTab === "voice" ? "flex" : "hidden"} lg:flex`}
        >
          {!connected && hasConnected.current && (
            <div className="absolute inset-0 flex items-center justify-center bg-[rgba(10,22,36,0.8)] z-30 rounded-2xl">
              <div className="text-center" role="status" aria-live="polite" aria-atomic="true">
                <p className="text-sm" style={{ color: "rgba(244, 240, 234, 0.7)" }}>Connection lost</p>
                <p className="text-xs mt-1" style={{ color: "rgba(244, 240, 234, 0.3)" }}>Reconnecting...</p>
              </div>
            </div>
          )}
          <VoiceOrb
            state={state}
            label={stateLabels[state]}
            connected={connected}
            inputMode={inputMode}
            onPushStart={handlePushToTalk}
            onPushEnd={handleRelease}
          />

          <MetricsOverlay metrics={metrics} />

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleModeSwitch}
              className="text-[10px] uppercase tracking-widest px-3 py-1 rounded-full transition-all duration-300 hover:text-gold-light"
              style={{
                color: "rgba(244, 240, 234, 0.4)",
                border: "1px solid rgba(200, 169, 126, 0.15)",
              }}
            >
              {inputMode === "push" ? "Push to Talk" : "Hands Free"}
            </button>

            {(state === "speaking" || state === "processing") && (
              <button
                type="button"
                onClick={() => { doInterrupt(); setAgentState("idle"); }}
                className="px-3 py-1 rounded-full text-[10px] font-medium uppercase tracking-widest transition-all duration-300 hover:bg-gold/10"
                style={{
                  color: "rgba(244, 240, 234, 0.5)",
                  border: "1px solid rgba(200, 169, 126, 0.2)",
                }}
              >
                Interrupt
              </button>
            )}
          </div>

          <form onSubmit={handleTextSubmit} className="w-full max-w-md flex gap-2">
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
        </div>

        <div
          className={`w-80 xl:w-[340px] shrink-0 flex-col glass-panel m-3 ml-1.5 rounded-2xl overflow-hidden ${mobileTab === "intel" ? "flex" : "hidden"} lg:flex`}
        >
          <div className="flex shrink-0" style={{ borderBottom: "1px solid rgba(200, 169, 126, 0.06)" }}>
            {(["crm", "analytics"] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setIntelTab(tab)}
                className="flex-1 px-3 py-3 text-[10px] font-medium uppercase tracking-[0.15em] transition-all duration-300 relative"
                style={{
                  color: intelTab === tab ? "rgba(226, 198, 157, 0.9)" : "rgba(244, 240, 234, 0.3)",
                  background: intelTab === tab ? "rgba(200, 169, 126, 0.06)" : "transparent",
                }}
              >
                {tab === "crm" ? "CRM" : "Analytics"}
                {intelTab === tab && (
                  <div className="absolute bottom-0 left-1/4 right-1/4 h-px" style={{ background: "rgba(200, 169, 126, 0.4)" }} />
                )}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            {intelTab === "crm" ? <CRMPanel refreshKey={crmRefreshKey} /> : <AnalyticsPanel sessionMetrics={sessionAnalytics} />}
          </div>
        </div>
      </div>

      <nav
        className="lg:hidden glass-panel shrink-0 flex z-20 rounded-none"
        style={{ borderBottom: "none", borderLeft: "none", borderRight: "none" }}
      >
        {mobileTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setMobileTab(tab.id)}
            className="flex-1 flex flex-col items-center gap-1 py-3 transition-all duration-200"
            style={{
              color: mobileTab === tab.id ? "rgba(226, 198, 157, 0.9)" : "rgba(244, 240, 234, 0.3)",
              background: mobileTab === tab.id ? "rgba(200, 169, 126, 0.04)" : "transparent",
            }}
          >
            {tab.icon}
            <span className="text-[9px] uppercase tracking-wider font-medium">
              {tab.label}
            </span>
          </button>
        ))}
      </nav>
    </div>
  );
}
