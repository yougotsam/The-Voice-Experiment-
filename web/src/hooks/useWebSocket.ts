"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type BaseMessage = {
  text?: string;
  name?: string;
  status?: string;
  sample_rate?: number;
  llm_ttfb_ms?: number;
  tts_ttfb_ms?: number;
  total_ms?: number;
  arguments?: Record<string, unknown>;
  success?: boolean;
  summary?: string;
  persona_id?: string;
  greeting?: string;
  model_id?: string;
  provider?: string;
  agent_id?: string;
  event_type?: string;
  category?: string;
  contact_name?: string;
  details?: Record<string, unknown>;
};

export type ServerMessage = BaseMessage & (
  | { type: "transcript.partial" }
  | { type: "transcript.final" }
  | { type: "agent.text" }
  | { type: "agent.audio.start" }
  | { type: "agent.audio.end" }
  | { type: "metrics" }
  | { type: "analytics" }
  | { type: "status" }
  | { type: "tool_call.start" }
  | { type: "tool_call.result" }
  | { type: "persona.loaded" }
  | { type: "agent.routed" }
  | { type: "webhook.event" }
  | { type: "config.current" }
  | { type: "model.loaded" }
  | { type: "tts.loaded" }
  | { type: "error" }
  | { type: "ping" }
);

type UseWebSocketOptions = {
  url: string;
  onMessage?: (msg: ServerMessage) => void;
  onBinary?: (data: ArrayBuffer) => void;
  onOpen?: () => void;
  onClose?: () => void;
};

export function useWebSocket({
  url,
  onMessage,
  onBinary,
  onOpen,
  onClose,
}: UseWebSocketOptions) {
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const onMessageRef = useRef(onMessage);
  const onBinaryRef = useRef(onBinary);
  const onOpenRef = useRef(onOpen);
  const onCloseRef = useRef(onClose);
  onMessageRef.current = onMessage;
  onBinaryRef.current = onBinary;
  onOpenRef.current = onOpen;
  onCloseRef.current = onClose;

  const mountedRef = useRef(true);

  const connect = useCallback(() => {
    if (!mountedRef.current) return;
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(url);
    ws.binaryType = "arraybuffer";

    ws.onopen = () => {
      setConnected(true);
      onOpenRef.current?.();
    };

    ws.onmessage = (event) => {
      if (event.data instanceof ArrayBuffer) {
        onBinaryRef.current?.(event.data);
      } else {
        try {
          const msg: ServerMessage = JSON.parse(event.data);
          if (msg.type === "ping") {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: "pong" }));
            }
            return;
          }
          onMessageRef.current?.(msg);
        } catch {
          // ignore malformed messages
        }
      }
    };

    ws.onclose = () => {
      setConnected(false);
      onCloseRef.current?.();
      if (mountedRef.current) {
        reconnectTimer.current = setTimeout(connect, 2000);
      }
    };

    ws.onerror = () => {
      ws.close();
    };

    wsRef.current = ws;
  }, [url]);

  useEffect(() => {
    mountedRef.current = true;
    connect();
    return () => {
      mountedRef.current = false;
      clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [connect]);

  const sendJSON = useCallback((data: Record<string, unknown>) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    }
  }, []);

  const sendBinary = useCallback((data: ArrayBuffer) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(data);
    }
  }, []);

  return { connected, sendJSON, sendBinary };
}
