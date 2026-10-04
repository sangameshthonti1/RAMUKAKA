from datetime import datetime
from typing import Literal

from app.core.types import TruthLabel
from app.schemas.api import Identifier, Input, Output, Text


class ConversationCreate(Input):
    household_id: Identifier


class CustomerSend(Input):
    text: Text
    asset_id: Identifier | None = None
    action: Literal["message", "confirm_report", "cancel_report"] = "message"


class ProviderSend(Input):
    provider_id: Identifier
    text: Text


class ChatMessageOut(Output):
    id: str
    conversation_id: str
    role: Literal["customer", "provider", "assistant"]
    content: str
    truth_label: TruthLabel
    created_at: datetime


class ConversationSummary(Output):
    id: str
    household_id: str
    case_id: str | None
    asset_id: str | None
    draft_complaint: str | None
    stage: str
    status: str
    created_at: datetime
    updated_at: datetime


class ConversationDetail(ConversationSummary):
    messages: list[ChatMessageOut]
