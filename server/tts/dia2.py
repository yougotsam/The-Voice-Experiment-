import asyncio
import logging
import sys
from pathlib import Path
from typing import AsyncIterator

from server.tts.base import TTSProvider

logger = logging.getLogger(__name__)

_engine = None


def _load_engine():
    global _engine
    if _engine is not None:
        return _engine

    try:
        from dia2 import Dia2
    except ImportError:
        raise ImportError(
            "dia2 is not installed. Clone https://github.com/yougotsam/dia2-voice "
            "and install with: pip install -e ./dia2-voice"
        )

    import torch

    device = "cuda" if torch.cuda.is_available() else "cpu"
    dtype = "bfloat16" if device == "cuda" else "float32"
    logger.info("Loading Dia2 on %s (%s)", device, dtype)
    _engine = Dia2.from_repo("nari-labs/Dia2-2B", device=device, dtype=dtype)
    logger.info("Dia2 loaded, sample_rate=%d", _engine.codec.sample_rate)
    return _engine


class Dia2TTS(TTSProvider):
    sample_rate: int = 24000

    def __init__(self):
        self._speaker_tag = "[S1]"

    async def synthesize(self, text: str, voice_id: str = "") -> AsyncIterator[bytes]:
        loop = asyncio.get_running_loop()
        audio_bytes = await loop.run_in_executor(None, self._generate_sync, text)
        yield audio_bytes

    def _generate_sync(self, text: str) -> bytes:
        engine = _load_engine()
        script = f"{self._speaker_tag} {text}"

        result = engine.generate(script, verbose=False)

        self.sample_rate = result.sample_rate

        audio_np = result.waveform.cpu().numpy()
        pcm16 = (audio_np * 32767).clip(-32768, 32767).astype("int16")
        return pcm16.tobytes()
