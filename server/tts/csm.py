import asyncio
import io
import logging
import struct
import sys
from pathlib import Path
from typing import AsyncIterator

from server.tts.base import TTSProvider

logger = logging.getLogger(__name__)

REPO_ROOT = str(Path(__file__).resolve().parent.parent.parent)
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)

_generator = None
_prompt_segments = None


def _load_model():
    global _generator, _prompt_segments
    if _generator is not None:
        return _generator, _prompt_segments

    import os
    os.environ["NO_TORCH_COMPILE"] = "1"

    import torch
    from generator import load_csm_1b, Segment
    from run_csm import prepare_prompt, SPEAKER_PROMPTS

    device = "cuda" if torch.cuda.is_available() else "cpu"
    logger.info("Loading CSM-1B on %s", device)
    _generator = load_csm_1b(device)

    _prompt_segments = [
        prepare_prompt(
            SPEAKER_PROMPTS["conversational_a"]["text"],
            0,
            SPEAKER_PROMPTS["conversational_a"]["audio"],
            _generator.sample_rate,
        ),
    ]

    logger.info("CSM-1B loaded, sample_rate=%d", _generator.sample_rate)
    return _generator, _prompt_segments


class CSMTTS(TTSProvider):
    def __init__(self):
        self._context_segments: list = []
        self._max_context = 4

    async def synthesize(self, text: str) -> AsyncIterator[bytes]:
        loop = asyncio.get_running_loop()
        audio_bytes = await loop.run_in_executor(None, self._generate_sync, text)
        yield audio_bytes

    def _generate_sync(self, text: str) -> bytes:
        import torch
        from generator import Segment

        generator, prompt_segments = _load_model()

        context = prompt_segments + self._context_segments[-self._max_context :]

        audio_tensor = generator.generate(
            text=text,
            speaker=0,
            context=context,
            max_audio_length_ms=10_000,
        )

        self._context_segments.append(
            Segment(text=text, speaker=0, audio=audio_tensor)
        )

        audio_np = audio_tensor.cpu().numpy()
        pcm16 = (audio_np * 32767).astype("int16")
        return pcm16.tobytes()
