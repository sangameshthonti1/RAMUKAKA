from typing import Any, Protocol


class Connector(Protocol):
    """Adapters expose reviewed operations, never arbitrary outbound URLs."""

    name: str
    description: str
    operations: dict[str, frozenset[str]]

    def execute(self, operation: str, payload: dict[str, Any]) -> dict[str, Any]: ...
