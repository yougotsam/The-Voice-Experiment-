"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type UseVADOptions = {
  onSpeechStart?: () => void;
  onSpeechEnd?: () => void;
  enabled?: boolean;
};

export function useVAD({ onSpeechStart, onSpeechEnd, enabled = false }: UseVADOptions) {
  const [speaking, setSpeaking] = useState(false);
  const vadRef = useRef<{ destroy: () => void } | null>(null);
  const onSpeechStartRef = useRef(onSpeechStart);
  const onSpeechEndRef = useRef(onSpeechEnd);
  onSpeechStartRef.current = onSpeechStart;
  onSpeechEndRef.current = onSpeechEnd;

  const startVAD = useCallback(async () => {
    if (vadRef.current) return;
    try {
      const { MicVAD } = await import("@ricky0123/vad-web");
      const vad = await MicVAD.new({
        positiveSpeechThreshold: 0.8,
        negativeSpeechThreshold: 0.4,
        minSpeechMs: 150,
        preSpeechPadMs: 300,
        redemptionMs: 500,
        onSpeechStart: () => {
          setSpeaking(true);
          onSpeechStartRef.current?.();
        },
        onSpeechEnd: () => {
          setSpeaking(false);
          onSpeechEndRef.current?.();
        },
      });
      vad.start();
      vadRef.current = vad;
    } catch (err) {
      console.warn("VAD init failed, falling back to push-to-talk:", err);
    }
  }, []);

  const stopVAD = useCallback(() => {
    vadRef.current?.destroy();
    vadRef.current = null;
    setSpeaking(false);
  }, []);

  useEffect(() => {
    if (enabled) {
      startVAD();
    } else {
      stopVAD();
    }
    return () => stopVAD();
  }, [enabled, startVAD, stopVAD]);

  return { speaking };
}
