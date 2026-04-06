from __future__ import annotations


class TTSError(Exception):
    def __init__(self, provider: str, message: str):
        self.provider = provider
        super().__init__(f"[{provider}] {message}")


class TTSAuthError(TTSError):
    pass


class TTSRateLimitError(TTSError):
    pass


class TTSTimeoutError(TTSError):
    pass


class TTSProviderUnavailableError(TTSError):
    pass


def raise_for_tts_status(provider: str, status_code: int, body: str) -> None:
    if status_code in (401, 403):
        raise TTSAuthError(provider, f"HTTP {status_code}: {body}")
    if status_code == 429:
        raise TTSRateLimitError(provider, f"HTTP {status_code}: {body}")
    if status_code == 408:
        raise TTSTimeoutError(provider, f"HTTP {status_code}: {body}")
    raise TTSError(provider, f"HTTP {status_code}: {body}")
