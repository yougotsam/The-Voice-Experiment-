import time


class ConversationSession:
    def __init__(self, session_id: str):
        self.session_id = session_id
        self.history: list[dict[str, str]] = []
        self.is_active = False
        self.created_at = time.time()

    def add_user_message(self, text: str) -> None:
        self.history.append({"role": "user", "content": text})

    def add_assistant_message(self, text: str) -> None:
        self.history.append({"role": "assistant", "content": text})

    def get_messages(self) -> list[dict[str, str]]:
        return list(self.history[-20:])
