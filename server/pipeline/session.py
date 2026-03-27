import time

DEFAULT_SYSTEM_PROMPT = (
    "You are a sharp, proactive voice assistant. Answer directly, anticipate follow-ups, "
    "and offer actionable next steps without being asked. Be conversational but never waste words. "
    "If the user is vague, ask one clarifying question instead of guessing. "
    "Respond in 1-3 sentences unless more detail is needed. "
    "Never use markdown, bullet points, or formatting -- your response will be spoken aloud."
)


class ConversationSession:
    def __init__(self, session_id: str):
        self.session_id = session_id
        self.history: list[dict[str, str]] = []
        self.system_prompt: str = DEFAULT_SYSTEM_PROMPT
        self.is_active = False
        self.created_at = time.time()

    def add_user_message(self, text: str) -> None:
        self.history.append({"role": "user", "content": text})

    def add_assistant_message(self, text: str) -> None:
        self.history.append({"role": "assistant", "content": text})

    def get_messages(self) -> list[dict[str, str]]:
        return list(self.history[-20:])

    def set_persona(self, system_prompt: str) -> None:
        self.system_prompt = system_prompt
        self.history.clear()
