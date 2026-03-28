from abc import ABC, abstractmethod
from typing import Any


class Tool(ABC):
    @property
    @abstractmethod
    def name(self) -> str: ...

    @property
    @abstractmethod
    def description(self) -> str: ...

    @property
    @abstractmethod
    def parameters(self) -> dict: ...

    @abstractmethod
    async def execute(self, **kwargs) -> dict[str, Any]: ...

    def schema(self) -> dict:
        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": self.parameters,
            },
        }


class ToolRegistry:
    def __init__(self) -> None:
        self._tools: dict[str, Tool] = {}

    def register(self, tool: Tool) -> None:
        self._tools[tool.name] = tool

    def get(self, name: str) -> Tool | None:
        return self._tools.get(name)

    def get_schemas(self) -> list[dict]:
        return [t.schema() for t in self._tools.values()]

    def subset(self, names: list[str]) -> "ToolRegistry":
        registry = ToolRegistry()
        for name in names:
            tool = self._tools.get(name)
            if tool:
                registry.register(tool)
        return registry

    def __len__(self) -> int:
        return len(self._tools)
