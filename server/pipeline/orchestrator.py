import asyncio
import logging
import re
from typing import Callable, Awaitable

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
        send_text: Callable[[str, str], Awaitable[None]],
        send_audio: Callable[[bytes], Awaitable[None]],
        send_status: Callable[[str], Awaitable[None]],
    ):
        self._stt = stt
        self._llm = llm
        self._tts = tts
        self._session = session
        self._send_text = send_text
        self._send_audio = send_audio
        self._send_status = send_status
        self._processing_lock = asyncio.Lock()

    async def start_listening(self) -> None:
        self._session.is_active = True
        await self._stt.start(
            on_partial=self._on_partial_transcript,
            on_final=self._on_final_transcript,
        )
        await self._send_status("listening")

    async def stop_listening(self) -> None:
        self._session.is_active = False
        await self._stt.stop()

    async def feed_audio(self, audio: bytes) -> None:
        await self._stt.send_audio(audio)

    async def _on_partial_transcript(self, text: str) -> None:
        await self._send_text("transcript.partial", text)

    async def _on_final_transcript(self, text: str) -> None:
        await self._send_text("transcript.final", text)
        asyncio.create_task(self._process_response(text))

    async def _process_response(self, user_text: str) -> None:
        async with self._processing_lock:
            await self._send_status("processing")
            self._session.add_user_message(user_text)

            full_response = ""
            buffer = ""

            async for token in self._llm.stream_chat(self._session.get_messages()):
                full_response += token
                buffer += token

                sentences = SENTENCE_END.split(buffer)
                if len(sentences) > 1:
                    for sentence in sentences[:-1]:
                        sentence = sentence.strip()
                        if sentence:
                            await self._send_text("agent.text", sentence)
                            await self._synthesize_and_send(sentence)
                    buffer = sentences[-1]

            if buffer.strip():
                await self._send_text("agent.text", buffer.strip())
                await self._synthesize_and_send(buffer.strip())

            self._session.add_assistant_message(full_response)
            await self._send_status("idle")

    async def _synthesize_and_send(self, text: str) -> None:
        await self._send_text("agent.audio.start", "")
        try:
            async for audio_chunk in self._tts.synthesize(text):
                await self._send_audio(audio_chunk)
        except Exception:
            logger.exception("TTS synthesis failed for: %s", text[:50])
        finally:
            await self._send_text("agent.audio.end", "")

    async def shutdown(self) -> None:
        await self._stt.stop()
        await self._tts.close()
