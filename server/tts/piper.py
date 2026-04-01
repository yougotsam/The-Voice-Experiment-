import asyncio
import logging
import os
import shutil
import subprocess
from pathlib import Path
from typing import AsyncIterator

from server.tts.base import TTSProvider

logger = logging.getLogger(__name__)

PIPER_SAMPLE_RATE = 22050


def _discover_voices(models_dir: str) -> dict[str, str]:
    voices: dict[str, str] = {}
    if not models_dir or not os.path.isdir(models_dir):
        return voices
    for f in Path(models_dir).glob("*.onnx"):
        name = f.stem
        voices[name] = str(f)
    return voices


class PiperTTS(TTSProvider):
    sample_rate: int = PIPER_SAMPLE_RATE

    def __init__(self, models_dir: str = "", default_voice: str = "hal"):
        self._piper_bin = shutil.which("piper")
        if not self._piper_bin:
            raise RuntimeError(
                "Piper CLI not found on PATH. "
                "Install with: pip install piper-tts  (or place the piper binary on PATH)"
            )
        self._models_dir = models_dir
        self._voices = _discover_voices(models_dir)
        if self._voices:
            logger.info("Piper voices discovered: %s", list(self._voices.keys()))

        if default_voice in self._voices:
            self._model = self._voices[default_voice]
            self._voice_name = default_voice
        elif self._voices:
            first = next(iter(self._voices))
            self._model = self._voices[first]
            self._voice_name = first
            logger.warning("Default voice '%s' not found, using '%s'", default_voice, first)
        else:
            raise RuntimeError(
                f"No Piper voice models found. Set PIPER_MODELS_DIR to a directory "
                f"containing .onnx voice files (searched: '{models_dir}')"
            )
        logger.info("Piper TTS ready: voice=%s model=%s bin=%s", self._voice_name, self._model, self._piper_bin)

    def set_voice(self, voice: str) -> bool:
        if voice in self._voices:
            self._model = self._voices[voice]
            self._voice_name = voice
            logger.info("Piper voice switched to '%s' (%s)", voice, self._model)
            return True
        logger.warning("Unknown Piper voice '%s', available: %s", voice, list(self._voices.keys()))
        return False

    async def synthesize(self, text: str, voice_id: str = "") -> AsyncIterator[bytes]:
        if not text or not text.strip():
            return
        model = self._model
        if voice_id and voice_id in self._voices:
            model = self._voices[voice_id]
        loop = asyncio.get_running_loop()
        audio = await loop.run_in_executor(None, self._generate_sync, text, model)
        if audio:
            yield audio

    def _generate_sync(self, text: str, model: str | None = None) -> bytes:
        model = model or self._model
        try:
            result = subprocess.run(
                [self._piper_bin, "--model", model, "--output-raw"],
                input=text.encode("utf-8"),
                capture_output=True, timeout=60,
            )
            if result.returncode != 0:
                stderr = result.stderr.decode(errors="replace")[:500]
                logger.error("Piper process failed (rc=%d): %s", result.returncode, stderr)
                return b""
            return result.stdout
        except subprocess.TimeoutExpired:
            logger.error("Piper synthesis timed out for text: %s...", text[:50])
            return b""
        except Exception:
            logger.exception("Piper synthesis error")
            return b""
