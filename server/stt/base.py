from abc import ABC, abstractmethod
from typing import Callable, Awaitable


class STTProvider(ABC):
    @abstractmethod
    async def start(
        self,
        on_partial: Callable[[str], Awaitable[None]],
        on_final: Callable[[str], Awaitable[None]],
    ) -> None: ...

    @abstractmethod
    async def send_audio(self, audio: bytes) -> None: ...

    @abstractmethod
    async def stop(self) -> None: ...
