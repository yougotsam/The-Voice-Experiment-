"use client";

import { useCallback, useRef } from "react";

const DEFAULT_SAMPLE_RATE = 24000;
const JITTER_BUFFER_MS = 200;

export function useAudioPlayback() {
  const contextRef = useRef<AudioContext | null>(null);
  const nextStartTime = useRef(0);
  const bufferQueue = useRef<ArrayBuffer[]>([]);
  const jitterTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const sampleRateRef = useRef(DEFAULT_SAMPLE_RATE);

  const getContext = useCallback(() => {
    const rate = sampleRateRef.current;
    if (!contextRef.current || contextRef.current.state === "closed" || contextRef.current.sampleRate !== rate) {
      contextRef.current?.close().catch(() => {});
      contextRef.current = new AudioContext({ sampleRate: rate });
    }
    if (contextRef.current.state === "suspended") {
      contextRef.current.resume();
    }
    return contextRef.current;
  }, []);

  const flushQueue = useCallback(() => {
    const ctx = getContext();
    const rate = sampleRateRef.current;

    while (bufferQueue.current.length > 0) {
      const chunk = bufferQueue.current.shift()!;
      const pcm16 = new Int16Array(chunk);
      const float32 = new Float32Array(pcm16.length);
      for (let i = 0; i < pcm16.length; i++) {
        float32[i] = pcm16[i] / 0x7fff;
      }

      const audioBuffer = ctx.createBuffer(1, float32.length, rate);
      audioBuffer.getChannelData(0).set(float32);

      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);

      const now = ctx.currentTime;
      const startAt = Math.max(now, nextStartTime.current);
      source.start(startAt);
      nextStartTime.current = startAt + audioBuffer.duration;
    }
  }, [getContext]);

  const setSampleRate = useCallback((rate: number) => {
    if (rate > 0) {
      sampleRateRef.current = rate;
    }
  }, []);

  const enqueue = useCallback(
    (audioData: ArrayBuffer) => {
      bufferQueue.current.push(audioData);

      if (bufferQueue.current.length === 1) {
        clearTimeout(jitterTimeout.current);
        jitterTimeout.current = setTimeout(flushQueue, JITTER_BUFFER_MS);
      } else {
        flushQueue();
      }
    },
    [flushQueue],
  );

  const stop = useCallback(() => {
    clearTimeout(jitterTimeout.current);
    bufferQueue.current = [];
    nextStartTime.current = 0;
    if (contextRef.current) {
      contextRef.current.close();
      contextRef.current = null;
    }
  }, []);

  return { enqueue, stop, setSampleRate };
}
