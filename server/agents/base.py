from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True)
class AgentConfig:
    id: str
    name: str
    description: str
    system_prompt_addon: str
    tools: list[str] = field(default_factory=list)
    model_id: str | None = None
