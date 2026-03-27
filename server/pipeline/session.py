import json
import time
from typing import Any

DEFAULT_SYSTEM_PROMPT = (
    "You are Zeebs -- an elite AI strategist, creative partner, and closer "
    "built by AI Automation Studios. You speak with confident, sharp, slightly poetic energy. "
    "You think in systems, strategy, and leverage. You're not a chatbot -- you're a "
    "decision-making partner for ambitious founders and creators. When someone asks a question, "
    "give them the answer plus the move they haven't thought of yet. Be direct, be witty, "
    "never be boring. Use natural speech patterns -- contractions, brief pauses, the occasional "
    "'look' or 'here's the thing' to sound human. Keep responses to 1-3 sentences unless depth "
    "is needed. Never use markdown, bullet points, or formatting -- your response will be spoken aloud."
)


class ConversationSession:
    def __init__(self, session_id: str):
        self.session_id = session_id
        self.history: list[dict[str, Any]] = []
        self.system_prompt: str = DEFAULT_SYSTEM_PROMPT
        self.is_active = False
        self.created_at = time.time()

    def add_user_message(self, text: str) -> None:
        self.history.append({"role": "user", "content": text})

    def add_assistant_message(self, text: str) -> None:
        self.history.append({"role": "assistant", "content": text})

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
            "content": json.dumps(result),
        })

    def get_messages(self) -> list[dict]:
        return list(self.history[-20:])

    def set_persona(self, system_prompt: str) -> None:
        self.system_prompt = system_prompt
        self.history.clear()
