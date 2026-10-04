from dataclasses import dataclass
from typing import Literal, Protocol

ModelProviderName = Literal["mock", "gemini", "claude", "openai"]


@dataclass(frozen=True)
class Classification:
    category: str
    urgency: str


class ModelProvider(Protocol):
    """A model proposes classification; backend services retain all action authority.

    Future adapters must validate structured output, minimize input, use environment
    credentials, and record their external request/response with an accurate label.
    """

    def classify(self, *, case_id: str, asset_id: str) -> Classification: ...


class MockModelProvider:
    def classify(self, *, case_id: str, asset_id: str) -> Classification:
        return Classification(category="water_purifier_service", urgency="routine")


def model_provider(name: ModelProviderName = "mock") -> ModelProvider:
    if name != "mock":
        raise ValueError(
            "Real-model adapters are proposed capabilities, not implemented integrations"
        )
    return MockModelProvider()
