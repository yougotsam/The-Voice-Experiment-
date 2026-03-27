import json
import time
from typing import Any

from server.personas import Persona, get_persona


class ConversationSession:
    MAX_STORED_HISTORY = 40
    MAX_CONTEXT_HISTORY = 20

    def __init__(self, session_id: str):
        self.session_id = session_id
        self.history: list[dict[str, Any]] = []
        self.persona: Persona = get_persona("default")
        self.is_active = False
        self.created_at = time.time()

    @property
    def system_prompt(self) -> str:
        return self.persona.system_prompt

    @staticmethod
    def _safe_slice_start(messages: list[dict], start: int) -> int:
        while start < len(messages) and messages[start].get("role") == "tool":
            start += 1
        if start < len(messages) and messages[start].get("role") == "assistant" and "tool_calls" in messages[start]:
            start += 1
            while start < len(messages) and messages[start].get("role") == "tool":
                start += 1
        return start

    def _trim_history(self) -> None:
        if len(self.history) > self.MAX_STORED_HISTORY:
            raw_start = len(self.history) - self.MAX_STORED_HISTORY
            safe_start = self._safe_slice_start(self.history, raw_start)
            self.history = self.history[safe_start:]

    def add_user_message(self, text: str) -> None:
        self.history.append({"role": "user", "content": text})
        self._trim_history()

    def add_assistant_message(self, text: str) -> None:
        self.history.append({"role": "assistant", "content": text})
        self._trim_history()

    def add_assistant_tool_calls(self, text: str, tool_calls: list[dict]) -> None:
        msg: dict[str, Any] = {"role": "assistant", "tool_calls": tool_calls}
        if text:
            msg["content"] = text
        else:
            msg["content"] = None
        self.history.append(msg)

    def add_tool_result(self, tool_call_id: str, name: str, result: dict) -> None:
        self.history.append({
            "role": "tool",
            "tool_call_id": tool_call_id,
            "name": name,
            "content": self._safe_json(result),
        })

    @staticmethod
    def _safe_json(data: Any) -> str:
        try:
            return json.dumps(data)
        except (TypeError, ValueError):
            return str(data)

    def get_messages(self) -> list[dict]:
        if len(self.history) <= self.MAX_CONTEXT_HISTORY:
            return list(self.history)
        raw_start = len(self.history) - self.MAX_CONTEXT_HISTORY
        safe_start = self._safe_slice_start(self.history, raw_start)
        return list(self.history[safe_start:])

    def set_persona(self, persona_id: str) -> None:
        self.persona = get_persona(persona_id)
        self.history.clear()
