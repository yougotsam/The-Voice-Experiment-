import asyncio
import logging
import re
import time
from typing import Any, Callable, Awaitable

from server.stt.base import STTProvider
from server.llm.base import LLMProvider
from server.tts.base import TTSProvider
from server.pipeline.session import ConversationSession

logger = logging.getLogger(__name__)

SENTENCE_END = re.compile(r"(?<=[.!?])\s+")


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
    ):
        self._stt = stt
        self._llm = llm
        self._tts = tts
        self._session = session
        self._send_json = send_json
        self._send_audio = send_audio
        self._send_status = send_status
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

    async def _process_response(self, user_text: str) -> None:
        async with self._processing_lock:
            t_start = time.perf_counter()
            llm_ttfb = 0.0
            tts_ttfb = 0.0

            await self._send_status("processing")
            self._session.add_user_message(user_text)

            full_response = ""
            buffer = ""
            first_llm_token = True
            first_tts_chunk = True

            async for token in self._llm.stream_chat(
                self._session.get_messages(),
                system_prompt=self._session.system_prompt,
            ):
                if first_llm_token:
                    llm_ttfb = time.perf_counter() - t_start
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
                            if first_tts_chunk:
                                tts_ttfb = time.perf_counter() - t_before_tts
                                first_tts_chunk = False
                    buffer = sentences[-1]

            if buffer.strip():
                await self._send_json("agent.text", {"text": buffer.strip()})
                t_before_tts = time.perf_counter()
                await self._synthesize_and_send(buffer.strip())
                if first_tts_chunk:
                    tts_ttfb = time.perf_counter() - t_before_tts
                    first_tts_chunk = False

            self._session.add_assistant_message(full_response)

            total = time.perf_counter() - t_start
            await self._send_json("metrics", {
                "llm_ttfb_ms": round(llm_ttfb * 1000),
                "tts_ttfb_ms": round(tts_ttfb * 1000),
                "total_ms": round(total * 1000),
            })
            await self._send_status("idle")

    async def _synthesize_and_send(self, text: str) -> None:
        started = False
        try:
            async for audio_chunk in self._tts.synthesize(text):
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

    async def shutdown(self) -> None:
        if self._response_task and not self._response_task.done():
            self._response_task.cancel()
            try:
                await self._response_task
            except asyncio.CancelledError:
                pass
        await self._stt.stop()
        await self._tts.close()
