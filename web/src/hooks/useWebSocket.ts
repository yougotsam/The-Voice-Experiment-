"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type ServerMessage = {
  type: string;
  text?: string;
  status?: string;
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

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(url);
    ws.binaryType = "arraybuffer";

    ws.onopen = () => {
      setConnected(true);
      onOpen?.();
    };

    ws.onmessage = (event) => {
      if (event.data instanceof ArrayBuffer) {
        onBinary?.(event.data);
      } else {
        try {
          const msg: ServerMessage = JSON.parse(event.data);
          onMessage?.(msg);
        } catch {
          // ignore malformed messages
        }
      }
    };

    ws.onclose = () => {
      setConnected(false);
      onClose?.();
      reconnectTimer.current = setTimeout(connect, 2000);
    };

    ws.onerror = () => {
      ws.close();
    };

    wsRef.current = ws;
  }, [url, onMessage, onBinary, onOpen, onClose]);

  useEffect(() => {
    connect();
    return () => {
      clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
