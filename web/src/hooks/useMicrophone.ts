"use client";

import { useCallback, useRef, useState } from "react";

const TARGET_SAMPLE_RATE = 16000;
const BUFFER_SIZE = 1600; // 100ms at 16kHz

export function useMicrophone(onAudioChunk: (pcm16: ArrayBuffer) => void) {
  const [active, setActive] = useState(false);
  const contextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const workletRef = useRef<AudioWorkletNode | null>(null);

  const start = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        sampleRate: TARGET_SAMPLE_RATE,
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
      },
    });

    const context = new AudioContext({ sampleRate: TARGET_SAMPLE_RATE });
    await context.audioWorklet.addModule("/mic-processor.js");

    const source = context.createMediaStreamSource(stream);
    const worklet = new AudioWorkletNode(context, "mic-processor", {
      processorOptions: { bufferSize: BUFFER_SIZE },
    });

    worklet.port.onmessage = (event: MessageEvent) => {
      const float32: Float32Array = event.data;
      const pcm16 = new Int16Array(float32.length);
      for (let i = 0; i < float32.length; i++) {
        const s = Math.max(-1, Math.min(1, float32[i]));
        pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }
      onAudioChunk(pcm16.buffer);
    };

    source.connect(worklet);
    worklet.connect(context.destination);

    contextRef.current = context;
    streamRef.current = stream;
    workletRef.current = worklet;
    setActive(true);
  }, [onAudioChunk]);

  const stop = useCallback(() => {
    workletRef.current?.disconnect();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    contextRef.current?.close();
    workletRef.current = null;
    streamRef.current = null;
    contextRef.current = null;
    setActive(false);
  }, []);

  return { active, start, stop };
}
