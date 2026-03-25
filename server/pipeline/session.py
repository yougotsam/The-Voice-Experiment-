import time

DEFAULT_SYSTEM_PROMPT = (
    "You are a helpful voice assistant. Keep responses concise and conversational. "
    "Respond in 1-3 sentences unless the user asks for more detail. "
    "Do not use markdown, bullet points, or formatting -- your response will be spoken aloud."
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
