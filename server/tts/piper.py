import asyncio
import json
import logging
import shutil
import subprocess
from typing import AsyncIterator

from server.tts.base import TTSProvider

logger = logging.getLogger(__name__)

PIPER_SAMPLE_RATE = 22050


class PiperTTS(TTSProvider):
    sample_rate: int = PIPER_SAMPLE_RATE

    def __init__(self, model: str = "en_US-lessac-medium"):
        self._piper_bin = shutil.which("piper")
        if not self._piper_bin:
            raise RuntimeError(
                "Piper CLI not found on PATH. "
                "Install with: pip install piper-tts  (or place the piper binary on PATH)"
            )
        self._model = model
        self._detect_sample_rate()
        logger.info("Piper TTS ready: model=%s sample_rate=%d bin=%s", model, self.sample_rate, self._piper_bin)

    def _detect_sample_rate(self) -> None:
        try:
            result = subprocess.run(
                [self._piper_bin, "--model", self._model, "--json-input", "--output-raw"],
                input=json.dumps({"text": "hi"}).encode(),
                capture_output=True, timeout=30,
            )
            config_line = None
            for line in result.stderr.decode(errors="replace").splitlines():
                if "sample_rate" in line or '"sr"' in line:
                    config_line = line
                    break
            if config_line:
                import re
                m = re.search(r'"(?:sample_rate|sr)"\s*:\s*(\d+)', config_line)
                if m:
                    self.sample_rate = int(m.group(1))
        except Exception:
            pass

    def set_voice(self, voice: str) -> bool:
        logger.warning("Piper TTS uses local models — voice switching not supported (model: %s)", self._model)
        return False

    async def synthesize(self, text: str, voice_id: str = "") -> AsyncIterator[bytes]:
        if not text or not text.strip():
            return
        loop = asyncio.get_running_loop()
        audio = await loop.run_in_executor(None, self._generate_sync, text)
        if audio:
            yield audio

    def _generate_sync(self, text: str) -> bytes:
        try:
            result = subprocess.run(
                [self._piper_bin, "--model", self._model, "--output-raw"],
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
