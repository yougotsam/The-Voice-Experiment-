from __future__ import annotations

import time
from dataclasses import dataclass, field


@dataclass
class SessionMetrics:
    session_id: str
    started_at: float = field(default_factory=time.time)

    llm_ttfb_samples: list[float] = field(default_factory=list)
    tts_ttfb_samples: list[float] = field(default_factory=list)
    total_latency_samples: list[float] = field(default_factory=list)
    message_count: int = 0
    tool_calls_success: int = 0
    tool_calls_failed: int = 0
    tool_usage: dict[str, int] = field(default_factory=dict)
    persona_usage: dict[str, int] = field(default_factory=dict)

    def record_interaction(self, llm_ttfb_ms: float, tts_ttfb_ms: float, total_ms: float) -> None:
        self.llm_ttfb_samples.append(llm_ttfb_ms)
        self.tts_ttfb_samples.append(tts_ttfb_ms)
        self.total_latency_samples.append(total_ms)
        self.message_count += 1

    def record_tool_call(self, name: str, success: bool) -> None:
        self.tool_usage[name] = self.tool_usage.get(name, 0) + 1
        if success:
            self.tool_calls_success += 1
        else:
            self.tool_calls_failed += 1

    def record_persona(self, persona_id: str) -> None:
        self.persona_usage[persona_id] = self.persona_usage.get(persona_id, 0) + 1

    def snapshot(self) -> dict:
        def avg(samples: list[float]) -> int:
            return round(sum(samples) / len(samples)) if samples else 0

        return {
            "session_duration_s": round(time.time() - self.started_at),
            "message_count": self.message_count,
            "avg_llm_ttfb_ms": avg(self.llm_ttfb_samples),
            "avg_tts_ttfb_ms": avg(self.tts_ttfb_samples),
            "avg_total_ms": avg(self.total_latency_samples),
            "latency_history": [
                {"llm": round(l), "tts": round(t), "total": round(to)}
                for l, t, to in zip(
                    self.llm_ttfb_samples[-20:],
                    self.tts_ttfb_samples[-20:],
                    self.total_latency_samples[-20:],
                )
            ],
            "tool_calls_success": self.tool_calls_success,
            "tool_calls_failed": self.tool_calls_failed,
            "tool_usage": dict(self.tool_usage),
            "persona_usage": dict(self.persona_usage),
        }
