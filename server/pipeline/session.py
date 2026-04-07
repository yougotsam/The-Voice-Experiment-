import json
import logging
import time
from typing import Any

from server.personas import Persona, get_persona

logger = logging.getLogger(__name__)


class ConversationSession:
    MAX_STORED_HISTORY = 40
    MAX_CONTEXT_HISTORY = 20

    def __init__(self, session_id: str, user_id: str = ""):
        self.session_id = session_id
        self.user_id = user_id or session_id
        self.history: list[dict[str, Any]] = []
        self.persona: Persona = get_persona("default")
        self.is_active = False
        self.created_at = time.time()
        self._memory_summary: str = ""

    @property
    def system_prompt(self) -> str:
        base = self.persona.system_prompt
        if self._memory_summary:
            base += f"\n\nMEMORY FROM PREVIOUS SESSION:\n{self._memory_summary}"
        return base

    def set_memory_summary(self, summary: str) -> None:
        self._memory_summary = summary

    async def restore_from_memory(self, memory) -> None:
        if not memory or not memory.available:
            return
        try:
            self._memory_summary = await memory.get_summary(self.user_id)
            prior = await memory.load_history(self.user_id)
            if prior:
                restorable = [
                    m for m in prior
                    if m.get("role") in ("user", "assistant") and m.get("content")
                ]
                self.history = restorable[-self.MAX_STORED_HISTORY:]
                logger.info("Restored %d messages from memory for %s", len(self.history), self.user_id)
        except Exception:
            logger.warning("Memory restore failed", exc_info=True)

    async def persist_to_memory(self, memory) -> None:
        if not memory or not memory.available:
            return
        try:
            saveable = [
                m for m in self.history
                if m.get("role") in ("user", "assistant") and m.get("content")
            ]
            await memory.save_history(self.user_id, saveable)
        except Exception:
            logger.warning("Memory persist failed", exc_info=True)

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
