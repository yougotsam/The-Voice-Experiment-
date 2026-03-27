export type AgentState = "idle" | "listening" | "processing" | "speaking";
export type InputMode = "push" | "vad";
export type Metrics = { llm_ttfb_ms: number; tts_ttfb_ms: number; total_ms: number };
