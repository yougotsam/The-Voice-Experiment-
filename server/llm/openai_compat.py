import logging
from typing import AsyncIterator

from openai import AsyncOpenAI

from server.llm.base import LLMProvider

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = (
    "You are a helpful voice assistant. Keep responses concise and conversational. "
    "Respond in 1-3 sentences unless the user asks for more detail. "
    "Do not use markdown, bullet points, or formatting -- your response will be spoken aloud."
)


class OpenAICompatLLM(LLMProvider):
    def __init__(self, api_key: str, base_url: str, model: str):
        self._client = AsyncOpenAI(api_key=api_key, base_url=base_url)
        self._model = model

    async def stream_chat(
        self,
        messages: list[dict[str, str]],
    ) -> AsyncIterator[str]:
        full_messages = [{"role": "system", "content": SYSTEM_PROMPT}, *messages]
        stream = await self._client.chat.completions.create(
            model=self._model,
            messages=full_messages,
            stream=True,
            max_tokens=256,
            temperature=0.7,
        )
        async for chunk in stream:
            delta = chunk.choices[0].delta
            if delta.content:
                yield delta.content
