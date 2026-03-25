"use client";

import { useEffect, useRef } from "react";

type AudioVisualizerProps = {
  stream?: MediaStream | null;
  active: boolean;
};

const BAR_COUNT = 32;
const BAR_GAP = 2;

export function AudioVisualizer({ stream, active }: AudioVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const contextRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    if (!active || !stream) {
      cancelAnimationFrame(animRef.current!);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }

    const audioCtx = new AudioContext();
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 128;
    const source = audioCtx.createMediaStreamSource(stream);
    source.connect(analyser);

    contextRef.current = audioCtx;
    analyserRef.current = analyser;

    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    const barWidth = (canvas.width - (BAR_COUNT - 1) * BAR_GAP) / BAR_COUNT;

    function draw() {
      if (!analyserRef.current || !ctx || !canvas) return;

      analyserRef.current.getByteFrequencyData(dataArray);
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      for (let i = 0; i < BAR_COUNT; i++) {
        const value = dataArray[i] || 0;
        const barHeight = (value / 255) * canvas.height * 0.9;
        const x = i * (barWidth + BAR_GAP);
        const y = canvas.height - barHeight;

        ctx.fillStyle = `rgba(96, 165, 250, ${0.4 + (value / 255) * 0.6})`;
        ctx.fillRect(x, y, barWidth, barHeight);
      }

      animRef.current = requestAnimationFrame(draw);
    }

    draw();

    return () => {
      cancelAnimationFrame(animRef.current!);
      source.disconnect();
      audioCtx.close();
    };
  }, [stream, active]);

  return (
    <canvas
      ref={canvasRef}
      width={320}
      height={64}
      className="mt-4 rounded-lg opacity-80"
    />
  );
}
