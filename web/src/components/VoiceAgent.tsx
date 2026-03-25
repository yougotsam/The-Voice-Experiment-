"use client";

import { useCallback, useRef, useState } from "react";
import { useWebSocket, ServerMessage } from "@/hooks/useWebSocket";
import { useMicrophone } from "@/hooks/useMicrophone";
import { useAudioPlayback } from "@/hooks/useAudioPlayback";
import { TranscriptPanel, TranscriptEntry } from "./TranscriptPanel";

type AgentState = "idle" | "listening" | "processing" | "speaking";

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000/ws";

export function VoiceAgent() {
  const [state, setState] = useState<AgentState>("idle");
  const [entries, setEntries] = useState<TranscriptEntry[]>([]);
  const [partial, setPartial] = useState("");
  const [connected, setConnected] = useState(false);
  const agentTextBuffer = useRef("");

  const { enqueue: enqueueAudio, stop: stopPlayback } = useAudioPlayback();

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
              {
                role: "agent",
                text: agentTextBuffer.current,
                timestamp: Date.now(),
              },
            ];
          });
          break;

        case "agent.audio.start":
          setState("speaking");
          break;

        case "agent.audio.end":
          break;

        case "status":
          if (msg.status === "idle") {
            setState("idle");
            agentTextBuffer.current = "";
          } else if (msg.status === "processing") {
            setState("processing");
          } else if (msg.status === "listening") {
            setState("listening");
          }
          break;

        case "error":
          console.error("Server error:", msg.text);
          break;
      }
    },
    [],
  );

  const handleBinary = useCallback(
    (data: ArrayBuffer) => {
      if (state !== "speaking") setState("speaking");
      enqueueAudio(data);
    },
    [enqueueAudio, state],
  );

  const { connected: wsConnected, sendJSON, sendBinary } = useWebSocket({
    url: WS_URL,
    onMessage: handleMessage,
    onBinary: handleBinary,
    onOpen: () => setConnected(true),
    onClose: () => {
      setConnected(false);
      setState("idle");
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

  const handlePushToTalk = useCallback(async () => {
    if (state === "idle" || state === "speaking") {
      stopPlayback();
      agentTextBuffer.current = "";
      await startMic();
      sendJSON({ type: "start" });
      setState("listening");
    }
  }, [state, startMic, sendJSON, stopPlayback]);

  const handleRelease = useCallback(() => {
    if (state === "listening") {
      stopMic();
      sendJSON({ type: "stop" });
      setState("processing");
    }
  }, [state, stopMic, sendJSON]);

  const stateLabel: Record<AgentState, string> = {
    idle: "Press & Hold to Talk",
    listening: "Listening...",
    processing: "Thinking...",
    speaking: "Speaking...",
  };

  const stateColor: Record<AgentState, string> = {
    idle: "bg-blue-600 hover:bg-blue-500",
    listening: "bg-red-600 hover:bg-red-500 animate-pulse",
    processing: "bg-amber-600",
    speaking: "bg-green-600",
  };

  return (
    <div className="flex w-full max-w-lg flex-col items-center">
      <div className="mb-4 flex items-center gap-2">
        <div
          className={`h-2 w-2 rounded-full ${
            connected ? "bg-green-400" : "bg-red-400"
          }`}
        />
        <span className="text-xs text-gray-500">
          {connected ? "Connected" : "Disconnected"}
        </span>
      </div>

      <button
        onMouseDown={handlePushToTalk}
        onMouseUp={handleRelease}
        onMouseLeave={handleRelease}
        onTouchStart={handlePushToTalk}
        onTouchEnd={handleRelease}
        disabled={!connected || state === "processing"}
        className={`h-32 w-32 rounded-full text-sm font-semibold text-white shadow-lg transition-all ${
          stateColor[state]
        } disabled:opacity-40 disabled:cursor-not-allowed`}
      >
        {stateLabel[state]}
      </button>

      <TranscriptPanel entries={entries} partialTranscript={partial} />
    </div>
  );
}
