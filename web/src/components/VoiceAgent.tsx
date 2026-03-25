"use client";

import { useCallback, useRef, useState } from "react";
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

export function VoiceAgent() {
  const [state, setState] = useState<AgentState>("idle");
  const [entries, setEntries] = useState<TranscriptEntry[]>([]);
  const [partial, setPartial] = useState("");
  const [connected, setConnected] = useState(false);
  const [inputMode, setInputMode] = useState<InputMode>("push");
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const agentTextBuffer = useRef("");
  const stateRef = useRef<AgentState>("idle");

  const { enqueue: enqueueAudio, stop: stopPlayback, setSampleRate } = useAudioPlayback();

  const handleMessage = useCallback(
    (msg: ServerMessage) => {
      switch (msg.type) {
        case "transcript.partial":
          setPartial(msg.text || "");
          break;

        case "transcript.final":
          setPartial("");
          if (msg.text) {
            setEntries((prev) => [
              ...prev,
              { role: "user", text: msg.text!, timestamp: Date.now() },
            ]);
          }
          break;

        case "agent.text":
          agentTextBuffer.current += (agentTextBuffer.current ? " " : "") + (msg.text || "");
          setEntries((prev) => {
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
          setState("speaking");
          stateRef.current = "speaking";
          break;

        case "agent.audio.end":
          break;

        case "metrics":
          setMetrics(msg as unknown as Metrics);
          break;

        case "status":
          if (msg.status === "idle") {
            setState("idle");
            stateRef.current = "idle";
            agentTextBuffer.current = "";
          } else if (msg.status === "processing") {
            setState("processing");
            stateRef.current = "processing";
          } else if (msg.status === "listening") {
            setState("listening");
            stateRef.current = "listening";
          }
          break;

        case "error":
          console.error("Server error:", msg.text);
          break;
      }
    },
    [setSampleRate],
  );

  const handleBinary = useCallback(
    (data: ArrayBuffer) => {
      setState("speaking");
      stateRef.current = "speaking";
      enqueueAudio(data);
    },
    [enqueueAudio],
  );

  const { connected: wsConnected, sendJSON, sendBinary } = useWebSocket({
    url: WS_URL,
    onMessage: handleMessage,
    onBinary: handleBinary,
    onOpen: () => setConnected(true),
    onClose: () => {
      setConnected(false);
      setState("idle");
      stateRef.current = "idle";
    },
  });

  const { active: micActive, start: startMic, stop: stopMic } = useMicrophone(
    useCallback(
      (pcm16: ArrayBuffer) => {
        sendBinary(pcm16);
      },
      [sendBinary],
    ),
  );

  const doInterrupt = useCallback(() => {
    stopPlayback();
    sendJSON({ type: "interrupt" });
  }, [stopPlayback, sendJSON]);

  const handlePushToTalk = useCallback(async () => {
    if (stateRef.current === "speaking" || stateRef.current === "processing") {
      doInterrupt();
    }
    stopPlayback();
    agentTextBuffer.current = "";
    await startMic();
    sendJSON({ type: "start" });
    setState("listening");
    stateRef.current = "listening";
  }, [startMic, sendJSON, stopPlayback, doInterrupt]);

  const handleRelease = useCallback(() => {
    if (stateRef.current === "listening") {
      stopMic();
      sendJSON({ type: "stop" });
      setState("processing");
      stateRef.current = "processing";
    }
  }, [stopMic, sendJSON]);

  const handlePersona = useCallback(
    (systemPrompt: string) => {
      sendJSON({ type: "config", system_prompt: systemPrompt });
      setEntries([]);
      setMetrics(null);
    },
    [sendJSON],
  );

  useVAD({
    enabled: inputMode === "vad" && connected,
    onSpeechStart: () => {
      if (stateRef.current === "speaking" || stateRef.current === "processing") {
        doInterrupt();
      }
      agentTextBuffer.current = "";
      sendJSON({ type: "start" });
      setState("listening");
      stateRef.current = "listening";
    },
    onSpeechEnd: () => {
      if (stateRef.current === "listening") {
        sendJSON({ type: "stop" });
        setState("processing");
        stateRef.current = "processing";
      }
    },
  });

  const stateLabel: Record<AgentState, string> = {
    idle: inputMode === "vad" ? "Listening..." : "Press & Hold to Talk",
    listening: "Listening...",
    processing: "Thinking...",
    speaking: "Speaking...",
  };

  const stateColor: Record<AgentState, string> = {
    idle: inputMode === "vad" ? "bg-green-700 ring-2 ring-green-400/40" : "bg-blue-600 hover:bg-blue-500",
    listening: "bg-red-600 hover:bg-red-500 animate-pulse",
    processing: "bg-amber-600",
    speaking: "bg-green-600",
  };

  return (
    <div className="flex w-full max-w-lg flex-col items-center">
      <PersonaSelector onSelect={handlePersona} />

      <div className="mb-3 flex items-center gap-3">
        <div className="flex items-center gap-2">
          <div
            className={`h-2 w-2 rounded-full ${connected ? "bg-green-400" : "bg-red-400"}`}
          />
          <span className="text-xs text-gray-500">
            {connected ? "Connected" : "Disconnected"}
          </span>
        </div>
        <button
          onClick={() => setInputMode((m) => (m === "push" ? "vad" : "push"))}
          className="rounded-md bg-gray-800 px-2 py-0.5 text-xs text-gray-400 hover:bg-gray-700 hover:text-gray-200 transition-colors"
        >
          {inputMode === "push" ? "Push-to-Talk" : "Hands-Free"}
        </button>
      </div>

      {inputMode === "push" ? (
        <button
          onMouseDown={handlePushToTalk}
          onMouseUp={handleRelease}
          onMouseLeave={handleRelease}
          onTouchStart={handlePushToTalk}
          onTouchEnd={handleRelease}
          disabled={!connected || state === "processing"}
          className={`h-32 w-32 rounded-full text-sm font-semibold text-white shadow-lg transition-all ${stateColor[state]} disabled:opacity-40 disabled:cursor-not-allowed`}
        >
          {stateLabel[state]}
        </button>
      ) : (
        <div className="flex flex-col items-center gap-3">
          <div
            className={`flex h-32 w-32 items-center justify-center rounded-full text-sm font-semibold text-white shadow-lg transition-all ${stateColor[state]}`}
          >
            {stateLabel[state]}
          </div>
          {(state === "speaking" || state === "processing") && (
            <button
              onClick={doInterrupt}
              className="rounded-md bg-red-700 px-4 py-1.5 text-xs font-medium text-white hover:bg-red-600 transition-colors"
            >
              Interrupt
            </button>
          )}
        </div>
      )}

      <MetricsOverlay metrics={metrics} />
      <TranscriptPanel entries={entries} partialTranscript={partial} />
    </div>
  );
}
