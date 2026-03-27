"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type UseVADOptions = {
  onSpeechStart?: () => void;
  onSpeechEnd?: () => void;
  enabled?: boolean;
};

let vadModuleCache: typeof import("@ricky0123/vad-web") | null = null;
let vadModuleLoading: Promise<typeof import("@ricky0123/vad-web")> | null = null;

function preloadVADModule(): Promise<typeof import("@ricky0123/vad-web")> {
  if (vadModuleCache) return Promise.resolve(vadModuleCache);
  if (vadModuleLoading) return vadModuleLoading;
  vadModuleLoading = import("@ricky0123/vad-web").then((mod) => {
    vadModuleCache = mod;
    return mod;
  });
  return vadModuleLoading;
}

export function useVAD({ onSpeechStart, onSpeechEnd, enabled = false }: UseVADOptions) {
  const [speaking, setSpeaking] = useState(false);
  const vadRef = useRef<{ destroy: () => void } | null>(null);
  const onSpeechStartRef = useRef(onSpeechStart);
  const onSpeechEndRef = useRef(onSpeechEnd);
  onSpeechStartRef.current = onSpeechStart;
  onSpeechEndRef.current = onSpeechEnd;

  useEffect(() => {
    preloadVADModule();
  }, []);

  const startVAD = useCallback(async () => {
    if (vadRef.current) return;
    const origError = console.error;
    try {
      console.error = (...args: unknown[]) => {
        const msg = String(args[0] ?? "");
        if (msg.includes("model file") || msg.includes("onnx")) return;
        origError.apply(console, args);
      };
      const vadModule = await preloadVADModule();
      const vad = await vadModule.MicVAD.new({
        baseAssetPath: "/",
        onnxWASMBasePath: "/",
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
    } catch {
      // VAD not available -- push-to-talk still works
    } finally {
      console.error = origError;
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
