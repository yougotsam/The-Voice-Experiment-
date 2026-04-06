import asyncio
import base64
import json
import logging
import ssl
from typing import Any, Callable, Awaitable

import certifi
import websockets
from websockets.asyncio.client import ClientConnection

logger = logging.getLogger(__name__)

XAI_REALTIME_URL = "wss://api.x.ai/v1/realtime"

REALTIME_VOICES = {"Eve", "Ara", "Rex", "Sal", "Leo"}


def _convert_tool_schemas(openai_schemas: list[dict]) -> list[dict]:
    rt_tools = []
    for schema in openai_schemas:
        fn = schema.get("function", {})
        rt_tools.append({
            "type": "function",
            "name": fn.get("name", ""),
            "description": fn.get("description", ""),
            "parameters": fn.get("parameters", {}),
        })
    return rt_tools


class XaiRealtimeSession:
    def __init__(
        self,
        api_key: str,
        voice: str = "Eve",
        instructions: str = "You are a helpful voice assistant.",
        sample_rate: int = 24000,
        language: str = "en",
        tools: list[dict] | None = None,
        tool_executor: Callable[[str, dict], Awaitable[dict]] | None = None,
    ):
        self._api_key = api_key
        self._voice = voice if voice in REALTIME_VOICES else "Eve"
        self._instructions = instructions
        self._sample_rate = sample_rate
        self._language = language
        self._tools = _convert_tool_schemas(tools) if tools else []
        self._tool_executor = tool_executor
        self._ws: ClientConnection | None = None
        self._receive_task: asyncio.Task | None = None
        self._on_audio: Callable[[bytes], Awaitable[None]] | None = None
        self._on_audio_start: Callable[[], Awaitable[None]] | None = None
        self._on_audio_end: Callable[[], Awaitable[None]] | None = None
        self._on_transcript: Callable[[str], Awaitable[None]] | None = None
        self._on_status: Callable[[str], Awaitable[None]] | None = None
        self._on_text: Callable[[str], Awaitable[None]] | None = None
        self._on_tool_start: Callable[[str, dict], Awaitable[None]] | None = None
        self._on_tool_result: Callable[[str, dict], Awaitable[None]] | None = None
        self._connected = False
        self._pending_tool_calls: list[dict] = []

    async def connect(
        self,
        on_audio: Callable[[bytes], Awaitable[None]],
        on_audio_start: Callable[[], Awaitable[None]] | None = None,
        on_audio_end: Callable[[], Awaitable[None]] | None = None,
        on_transcript: Callable[[str], Awaitable[None]] | None = None,
        on_status: Callable[[str], Awaitable[None]] | None = None,
        on_text: Callable[[str], Awaitable[None]] | None = None,
        on_tool_start: Callable[[str, dict], Awaitable[None]] | None = None,
        on_tool_result: Callable[[str, dict], Awaitable[None]] | None = None,
    ) -> None:
        self._on_audio = on_audio
        self._on_audio_start = on_audio_start
        self._on_audio_end = on_audio_end
        self._on_transcript = on_transcript
        self._on_status = on_status
        self._on_text = on_text
        self._on_tool_start = on_tool_start
        self._on_tool_result = on_tool_result

        ssl_ctx = ssl.create_default_context(cafile=certifi.where())
        self._ws = await websockets.connect(
            XAI_REALTIME_URL,
            ssl=ssl_ctx,
            additional_headers={"Authorization": f"Bearer {self._api_key}"},
        )
        self._connected = True
        logger.info("xAI Realtime connected: voice=%s rate=%d tools=%d", self._voice, self._sample_rate, len(self._tools))

        session_cfg: dict[str, Any] = {
            "voice": self._voice,
            "instructions": self._instructions,
            "language": self._language,
            "turn_detection": {
                "type": "server_vad",
                "threshold": 0.6,
                "silence_duration_ms": 800,
                "prefix_padding_ms": 333,
            },
            "audio": {
                "input": {"format": {"type": "audio/pcm", "rate": self._sample_rate}},
                "output": {"format": {"type": "audio/pcm", "rate": self._sample_rate}},
            },
        }
        if self._tools:
            session_cfg["tools"] = self._tools
        await self._ws.send(json.dumps({"type": "session.update", "session": session_cfg}))
        self._receive_task = asyncio.create_task(self._receive_loop())

    async def send_audio(self, audio_bytes: bytes) -> None:
        if not self._ws or not self._connected:
            return
        encoded = base64.b64encode(audio_bytes).decode("utf-8")
        try:
            await self._ws.send(json.dumps({
                "type": "input_audio_buffer.append",
                "audio": encoded,
            }))
        except Exception:
            logger.warning("Failed to send audio to xAI Realtime", exc_info=True)

    async def send_text(self, text: str) -> None:
        if not self._ws or not self._connected:
            return
        await self._ws.send(json.dumps({
            "type": "conversation.item.create",
            "item": {
                "type": "message",
                "role": "user",
                "content": [{"type": "input_text", "text": text}],
            },
        }))
        await self._ws.send(json.dumps({
            "type": "response.create",
            "response": {"modalities": ["text", "audio"]},
        }))

    async def _handle_tool_calls(self) -> None:
        if not self._pending_tool_calls or not self._ws:
            return
        calls = self._pending_tool_calls
        self._pending_tool_calls = []

        for tc in calls:
            name = tc["name"]
            call_id = tc["call_id"]
            raw_args = tc.get("arguments", "{}")
            try:
                args = json.loads(raw_args)
            except json.JSONDecodeError as exc:
                logger.warning(
                    "Failed to decode tool arguments for call_id=%s name=%s: %r (%s)",
                    call_id, name, raw_args, exc,
                )
                args = {}

            if self._on_tool_start:
                await self._on_tool_start(name, args)

            if self._tool_executor:
                try:
                    result = await self._tool_executor(name, args)
                except Exception:
                    logger.exception("Tool '%s' execution failed in realtime", name)
                    result = {"error": f"Tool '{name}' encountered an internal error."}
            else:
                result = {"error": f"No tool executor configured for '{name}'"}

            if self._on_tool_result:
                await self._on_tool_result(name, result)

            await self._ws.send(json.dumps({
                "type": "conversation.item.create",
                "item": {
                    "type": "function_call_output",
                    "call_id": call_id,
                    "output": json.dumps(result),
                },
            }))
            logger.info("Tool '%s' result sent to xAI Realtime (call_id=%s)", name, call_id)

        await self._ws.send(json.dumps({
            "type": "response.create",
            "response": {"modalities": ["text", "audio"]},
        }))

    async def _receive_loop(self) -> None:
        if not self._ws:
            return
        audio_started = False
        try:
            async for raw in self._ws:
                data = json.loads(raw)
                event_type = data.get("type", "")

                if event_type == "response.output_audio.delta":
                    audio_b64 = data.get("delta", "")
                    if audio_b64:
                        if not audio_started:
                            audio_started = True
                            if self._on_audio_start:
                                await self._on_audio_start()
                            if self._on_status:
                                await self._on_status("speaking")
                        pcm = base64.b64decode(audio_b64)
                        await self._on_audio(pcm)

                elif event_type == "response.output_audio.done":
                    if audio_started:
                        audio_started = False
                        if self._on_audio_end:
                            await self._on_audio_end()

                elif event_type == "response.output_audio_transcript.delta":
                    text = data.get("delta", "")
                    if text and self._on_text:
                        await self._on_text(text)

                elif event_type == "response.function_call_arguments.done":
                    self._pending_tool_calls.append({
                        "name": data.get("name", ""),
                        "call_id": data.get("call_id", ""),
                        "arguments": data.get("arguments", "{}"),
                    })
                    logger.info("Tool call queued: %s (call_id=%s)", data.get("name"), data.get("call_id"))

                elif event_type == "response.done":
                    if self._pending_tool_calls:
                        await self._handle_tool_calls()
                    else:
                        if self._on_status:
                            await self._on_status("idle")

                elif event_type == "input_audio_buffer.speech_started":
                    if self._on_status:
                        await self._on_status("listening")

                elif event_type == "input_audio_buffer.speech_stopped":
                    if self._on_status:
                        await self._on_status("processing")

                elif event_type == "error":
                    error = data.get("error", {})
                    logger.error("xAI Realtime error: %s", error.get("message", str(error)))

                elif event_type == "session.updated":
                    logger.info("xAI Realtime session configured")

        except websockets.exceptions.ConnectionClosed:
            logger.info("xAI Realtime connection closed")
        except asyncio.CancelledError:
            pass
        except Exception:
            logger.exception("xAI Realtime receive loop error")
        finally:
            self._connected = False

    async def close(self) -> None:
        self._connected = False
        if self._receive_task:
            self._receive_task.cancel()
            try:
                await self._receive_task
            except (asyncio.CancelledError, Exception):
                pass
        if self._ws:
            try:
                await self._ws.close()
            except Exception:
                pass
            self._ws = None
        logger.info("xAI Realtime session closed")
