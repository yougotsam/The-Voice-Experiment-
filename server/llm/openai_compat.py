import logging
from typing import AsyncIterator

from openai import AsyncOpenAI

from server.llm.base import LLMProvider

logger = logging.getLogger(__name__)


class OpenAICompatLLM(LLMProvider):
    def __init__(self, api_key: str, base_url: str, model: str):
        self._client = AsyncOpenAI(api_key=api_key, base_url=base_url)
        self._model = model

    async def stream_chat(
        self,
        messages: list[dict[str, str]],
        system_prompt: str = "",
    ) -> AsyncIterator[str]:
        full_messages = []
        if system_prompt:
            full_messages.append({"role": "system", "content": system_prompt})
        full_messages.extend(messages)
        stream = await self._client.chat.completions.create(
            model=self._model,
            messages=full_messages,
            stream=True,
            max_tokens=1024,
            temperature=0.7,
        )
        async for chunk in stream:
            if not chunk.choices:
                logger.debug("Stream chunk with no choices: %r", chunk)
                continue
            delta = chunk.choices[0].delta
            if delta.content:
                yield delta.content
