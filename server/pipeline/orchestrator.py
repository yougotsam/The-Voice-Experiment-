import asyncio
import json
import logging
import re
import time
from typing import Any, Callable, Awaitable

from server.stt.base import STTProvider
from server.llm.base import LLMProvider
from server.tts.base import TTSProvider
from server.pipeline.session import ConversationSession
from server.pipeline.metrics import SessionMetrics
from server.tools.base import ToolRegistry

logger = logging.getLogger(__name__)

SENTENCE_END = re.compile(r"(?<=[.!?])\s+")
MAX_TOOL_ROUNDS = 3

TOOL_AWARENESS_PREAMBLE = (
    "\n\nIMPORTANT RULES ABOUT YOUR CAPABILITIES:\n"
    "- You have access to specific tools listed below. ONLY claim to perform actions that you have tools for.\n"
    "- NEVER pretend, simulate, or hallucinate performing an action. If you don't have a tool for something, say so honestly.\n"
    "- NEVER say you 'just did' something unless you actually called a tool and got a real result back.\n"
    "- If someone asks you to do something you can't do, tell them clearly: 'I don't have that capability yet' or 'that integration isn't set up.'\n"
    "- Be transparent about what worked and what didn't when you use a tool.\n"
    "\nYour available tools:\n"
)

NO_TOOLS_NOTICE = (
    "\n\nIMPORTANT RULES ABOUT YOUR CAPABILITIES:\n"
    "- You are a voice-based conversational AI. You can talk, think, and advise.\n"
    "- You do NOT have access to any external tools, APIs, or integrations right now.\n"
    "- NEVER pretend to create, post, send, search, or modify anything in external systems.\n"
    "- NEVER say 'I just created a blog' or 'I connected to your CRM' or anything similar.\n"
    "- If someone asks you to perform an action on an external system, be honest: 'I don't have that integration set up yet.'\n"
    "- You CAN help with strategy, brainstorming, coaching, and conversation.\n"
)


class Orchestrator:
    def __init__(
        self,
        stt: STTProvider,
        llm: LLMProvider,
        tts: TTSProvider,
        session: ConversationSession,
        send_json: Callable[[str, dict[str, Any]], Awaitable[None]],
        send_audio: Callable[[bytes], Awaitable[None]],
        send_status: Callable[[str], Awaitable[None]],
        tool_registry: ToolRegistry | None = None,
        metrics: SessionMetrics | None = None,
    ):
        self._stt = stt
        self._llm = llm
        self._tts = tts
        self._session = session
        self._send_json = send_json
        self._send_audio = send_audio
        self._send_status = send_status
        self._tool_registry = tool_registry
        self._metrics = metrics
        self._processing_lock = asyncio.Lock()
        self._response_task: asyncio.Task | None = None

    async def start_listening(self) -> None:
        await self._stt.stop()
        self._session.is_active = True
        try:
            await self._stt.start(
                on_partial=self._on_partial_transcript,
                on_final=self._on_final_transcript,
            )
        except Exception:
            self._session.is_active = False
            raise
        await self._send_status("listening")

    async def stop_listening(self) -> None:
        self._session.is_active = False
        if hasattr(self._stt, "force_flush"):
            try:
                await self._stt.force_flush()
            except Exception:
                logger.warning("force_flush failed, proceeding to stop", exc_info=True)
        await self._stt.stop()

    async def interrupt(self) -> None:
        if self._response_task and not self._response_task.done():
            self._response_task.cancel()
            try:
                await self._response_task
            except asyncio.CancelledError:
                pass
            self._response_task = None
        await self._send_json("agent.audio.end", {})
        await self._send_status("idle")

    async def feed_audio(self, audio: bytes) -> None:
        await self._stt.send_audio(audio)

    async def _on_partial_transcript(self, text: str) -> None:
        await self._send_json("transcript.partial", {"text": text})

    async def _on_final_transcript(self, text: str) -> None:
        await self._send_json("transcript.final", {"text": text})
        self._response_task = asyncio.create_task(self._safe_process_response(text))

    async def _safe_process_response(self, text: str) -> None:
        try:
            await self._process_response(text)
        except asyncio.CancelledError:
            logger.info("Response cancelled (interrupted)")
        except Exception:
            logger.exception("Response pipeline failed")
            await self._send_json("error", {"text": "An error occurred while generating a response."})
            await self._send_status("idle")

    async def process_text_input(self, text: str) -> None:
        self._response_task = asyncio.create_task(self._safe_process_response(text))

    async def _process_response(self, user_text: str) -> None:
        async with self._processing_lock:
            t_start = time.perf_counter()
            llm_ttfb = 0.0
            tts_ttfb = 0.0

            await self._send_status("processing")
            self._session.add_user_message(user_text)

            tools = self._tool_registry.get_schemas() if self._tool_registry and len(self._tool_registry) > 0 else None
            system_prompt = self._build_system_prompt(tools)

            llm_measured = False
            tts_measured = False

            for _round in range(MAX_TOOL_ROUNDS + 1):
                full_response = ""
                tool_calls_result = None
                buffer = ""
                first_llm_token = True

                async for token in self._llm.stream_chat(
                    self._session.get_messages(),
                    system_prompt=system_prompt,
                    tools=tools,
                ):
                    if isinstance(token, dict):
                        tool_calls_result = token.get("tool_calls")
                        continue

                    if first_llm_token:
                        if not llm_measured:
                            llm_ttfb = time.perf_counter() - t_start
                            llm_measured = True
                        first_llm_token = False

                    full_response += token
                    buffer += token

                    sentences = SENTENCE_END.split(buffer)
                    if len(sentences) > 1:
                        for sentence in sentences[:-1]:
                            sentence = sentence.strip()
                            if sentence:
                                await self._send_json("agent.text", {"text": sentence})
                                t_before_tts = time.perf_counter()
                                await self._synthesize_and_send(sentence)
                                if not tts_measured:
                                    tts_ttfb = time.perf_counter() - t_before_tts
                                    tts_measured = True
                        buffer = sentences[-1]

                if buffer.strip():
                    await self._send_json("agent.text", {"text": buffer.strip()})
                    t_before_tts = time.perf_counter()
                    await self._synthesize_and_send(buffer.strip())
                    if not tts_measured:
                        tts_ttfb = time.perf_counter() - t_before_tts
                        tts_measured = True

                if not tool_calls_result:
                    self._session.add_assistant_message(full_response)
                    break

                self._session.add_assistant_tool_calls(full_response, tool_calls_result)
                await self._execute_tool_calls(tool_calls_result)
            else:
                logger.warning("Tool loop exhausted after %d rounds", MAX_TOOL_ROUNDS)
                self._session.add_assistant_message(
                    full_response or "I ran into a limit processing that request. Let me know if you'd like me to try again."
                )
                if not full_response:
                    await self._send_json("agent.text", {
                        "text": "I ran into a limit processing that request. Let me know if you'd like me to try again.",
                    })

            total = time.perf_counter() - t_start
            llm_ms = round(llm_ttfb * 1000)
            tts_ms = round(tts_ttfb * 1000)
            total_ms = round(total * 1000)
            await self._send_json("metrics", {
                "llm_ttfb_ms": llm_ms,
                "tts_ttfb_ms": tts_ms,
                "total_ms": total_ms,
            })
            if self._metrics:
                self._metrics.record_interaction(llm_ms, tts_ms, total_ms)
                await self._send_json("analytics", self._metrics.snapshot())
            await self._send_status("idle")

    async def _execute_tool_calls(self, tool_calls: list[dict]) -> None:
        if not self._tool_registry:
            return
        for tc in tool_calls:
            fn = tc.get("function", {})
            name = fn.get("name", "")
            tc_id = tc.get("id", "")
            try:
                args = json.loads(fn.get("arguments", "{}"))
            except json.JSONDecodeError:
                args = {}

            await self._send_json("tool_call.start", {"name": name, "arguments": args})

            tool = self._tool_registry.get(name)
            if not tool:
                result = {"error": f"Unknown tool: {name}"}
            else:
                try:
                    result = await tool.execute(**args)
                except Exception:
                    logger.exception("Tool %s failed", name)
                    result = {"error": f"Tool '{name}' encountered an internal error."}

            success = "error" not in result
            if self._metrics:
                self._metrics.record_tool_call(name, success)
            summary = self._summarize_tool_result(name, result)
            await self._send_json("tool_call.result", {
                "name": name,
                "success": success,
                "summary": summary,
            })
            self._session.add_tool_result(tc_id, name, result)

    def _build_system_prompt(self, tools: list[dict] | None) -> str:
        base = self._session.system_prompt
        if not tools:
            return base + NO_TOOLS_NOTICE
        tool_lines: list[str] = []
        for t in tools:
            fn = t.get("function")
            if not isinstance(fn, dict):
                continue
            name = fn.get("name")
            if not name:
                continue
            tool_lines.append(f"- {name}: {fn.get('description', '')}")
        if not tool_lines:
            return base + NO_TOOLS_NOTICE
        return base + TOOL_AWARENESS_PREAMBLE + "\n".join(tool_lines)

    @staticmethod
    def _summarize_tool_result(name: str, result: dict) -> str:
        if "error" in result:
            return f"Error: {result['error']}"
        if name == "search_contacts":
            total = result.get("total", 0)
            return f"Found {total} contact{'s' if total != 1 else ''}"
        if name == "draft_content":
            return f"Draft ready: {result.get('draft_type', 'content')} on \"{result.get('topic', '')}\""
        if name == "get_calendar_events":
            total = result.get("total", 0)
            return f"Found {total} event{'s' if total != 1 else ''}"
        if name == "move_opportunity":
            return f"Moved \"{result.get('name', 'opportunity')}\" to {result.get('stage', 'new stage')}"
        if name == "create_contact":
            return f"Created contact: {result.get('name', 'unknown')}"
        if name == "send_sms":
            return f"SMS sent to contact {result.get('contact_id', 'unknown')}"
        if name == "send_email":
            return f"Email sent: \"{result.get('subject', '')}\" to contact {result.get('contact_id', 'unknown')}"
        if name == "get_pipelines":
            total = result.get("total", 0)
            return f"Found {total} pipeline{'s' if total != 1 else ''}"
        if name == "create_opportunity":
            return f"Created deal: \"{result.get('name', '')}\" ({result.get('status', 'open')})"
        if name == "get_conversations":
            total = result.get("total", 0)
            return f"Found {total} conversation{'s' if total != 1 else ''}"
        try:
            return json.dumps(result)[:200]
        except (TypeError, ValueError):
            return str(result)[:200]

    async def _synthesize_and_send(self, text: str) -> None:
        started = False
        voice_id = self._session.persona.voice_id
        try:
            async for audio_chunk in self._tts.synthesize(text, voice_id=voice_id):
                if not started:
                    await self._send_json("agent.audio.start", {"sample_rate": self._tts.sample_rate})
                    started = True
                await self._send_audio(audio_chunk)
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("TTS synthesis failed for: %s", text[:50])
        finally:
            if started:
                await self._send_json("agent.audio.end", {})

    async def set_tts(self, new_tts: TTSProvider) -> None:
        old_tts = self._tts
        self._tts = new_tts
        if old_tts:
            await old_tts.close()

    async def shutdown(self) -> None:
        if self._response_task and not self._response_task.done():
            self._response_task.cancel()
            try:
                await self._response_task
            except asyncio.CancelledError:
                pass
        await self._stt.stop()
        await self._tts.close()
