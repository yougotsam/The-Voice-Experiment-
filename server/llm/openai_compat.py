import asyncio
import json
import logging
import ssl
from typing import Any, AsyncIterator

import certifi
import httpx
from openai import AsyncOpenAI

from server.llm.base import LLMProvider

logger = logging.getLogger(__name__)

LLM_TIMEOUT = httpx.Timeout(connect=10.0, read=60.0, write=10.0, pool=10.0)


def _make_http_client() -> httpx.AsyncClient:
    ssl_ctx = ssl.create_default_context(cafile=certifi.where())
    return httpx.AsyncClient(timeout=LLM_TIMEOUT, verify=ssl_ctx)


class OpenAICompatLLM(LLMProvider):
    def __init__(self, api_key: str, base_url: str, model: str):
        self._http_client = _make_http_client()
        self._client = AsyncOpenAI(api_key=api_key, base_url=base_url, http_client=self._http_client)
        self._model = model

    @property
    def model(self) -> str:
        return self._model

    def set_model(self, model: str, base_url: str, api_key: str) -> None:
        old_http = self._http_client
        self._model = model
        self._http_client = _make_http_client()
        self._client = AsyncOpenAI(api_key=api_key, base_url=base_url, http_client=self._http_client)
        try:
            loop = asyncio.get_running_loop()
            loop.create_task(old_http.aclose())
        except RuntimeError:
            pass

    async def stream_chat(
        self,
        messages: list[dict],
        system_prompt: str = "",
        tools: list[dict] | None = None,
        max_tokens: int = 1024,
    ) -> AsyncIterator[str | dict[str, Any]]:
        full_messages = []
        if system_prompt:
            full_messages.append({"role": "system", "content": system_prompt})
        full_messages.extend(messages)

        kwargs: dict[str, Any] = dict(
            model=self._model,
            messages=full_messages,
            stream=True,
            max_tokens=max_tokens,
            temperature=0.7,
        )
        if tools:
            kwargs["tools"] = tools
            kwargs["tool_choice"] = "auto"

        stream = await self._client.chat.completions.create(**kwargs)

        tool_calls_accum: dict[int, dict[str, str]] = {}

        async for chunk in stream:
            if not chunk.choices:
                logger.debug("Stream chunk with no choices: %r", chunk)
                continue
            delta = chunk.choices[0].delta

            if delta.content:
                yield delta.content

            if delta.tool_calls:
                for tc in delta.tool_calls:
                    idx = tc.index
                    if idx not in tool_calls_accum:
                        tool_calls_accum[idx] = {"id": "", "name": "", "arguments": ""}
                    if tc.id:
                        tool_calls_accum[idx]["id"] = tc.id
                    if tc.function:
                        if tc.function.name:
                            tool_calls_accum[idx]["name"] = tc.function.name
                        if tc.function.arguments:
                            tool_calls_accum[idx]["arguments"] += tc.function.arguments

        if tool_calls_accum:
            yield {
                "tool_calls": [
                    {
                        "id": tc["id"],
                        "type": "function",
                        "function": {"name": tc["name"], "arguments": tc["arguments"]},
                    }
                    for tc in tool_calls_accum.values()
                ]
            }
