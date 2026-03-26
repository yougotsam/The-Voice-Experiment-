"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type ServerMessage = {
  type: string;
  text?: string;
  status?: string;
  sample_rate?: number;
  llm_ttfb_ms?: number;
  tts_ttfb_ms?: number;
  total_ms?: number;
};

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

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(url);
    ws.binaryType = "arraybuffer";

    ws.onopen = () => {
      console.log("[WS] connected to", url);
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

    ws.onclose = (event) => {
      console.log("[WS] closed — code:", event.code, "reason:", event.reason);
      setConnected(false);
      onCloseRef.current?.();
      reconnectTimer.current = setTimeout(connect, 2000);
    };

    ws.onerror = () => {
      console.error("[WS] connection error — server may be unreachable at", url);
      ws.close();
    };

    wsRef.current = ws;
  }, [url]);

  useEffect(() => {
    connect();
    return () => {
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
