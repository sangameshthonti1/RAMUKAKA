import re
from datetime import date, datetime
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field, StrictBool, field_validator, model_validator

from app.core.types import TruthLabel

Kind = Literal["spend", "change_provider", "share_sensitive"]
Text = Annotated[str, Field(min_length=1, max_length=2000)]
Identifier = Annotated[str, Field(min_length=1, max_length=64, pattern=r"^[A-Za-z0-9_-]+$")]


class Output(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class Input(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class Record(Output):
    id: str
    created_at: datetime


class ManagedRecord(Record):
    updated_at: datetime
    truth_label: TruthLabel


class Participant(ManagedRecord):
    name: str
    role: str


class Household(ManagedRecord):
    name: str
    address: str | None
    latitude: float | None
    longitude: float | None
    participants: list[Participant]


class Asset(ManagedRecord):
    category: str
    household_id: str
    name: str
    brand: str
    model: str
    location: str
    installed_on: date
    purchased_on: date | None
    warranty_until: date | None
    next_service_on: date | None
    serial_number: str | None
    notes: str
    status: str


class CaseSummary(Record):
    household_id: str
    asset_id: str
    title: str
    complaint: str
    service_category: str
    service_description: str | None
    assigned: bool
    service_revision: int
    status: str
    quote_amount: int | None
    provider_id: str | None
    provider_confirmed: bool
    household_confirmed: bool
    updated_at: datetime


class CaseEvent(Record):
    case_id: str
    type: str
    title: str
    detail: str
    truth_label: TruthLabel


class Approval(Record):
    case_id: str
    kind: Kind
    status: Literal["pending", "approved", "rejected"]
    amount: int | None
    reason: str
    updated_at: datetime


class Evidence(Record):
    kind: str
    service_revision: int | None
    provider_id: str | None
    case_id: str
    title: str
    description: str
    truth_label: TruthLabel
    source: str


class Decision(Record):
    case_id: str
    action: str
    reason: str
    rule: str
    truth_label: TruthLabel


class ConnectorCall(Record):
    case_id: str
    connector: str
    operation: str
    request: dict[str, Any]
    response: dict[str, Any]
    truth_label: TruthLabel
    status: str


class Notification(Record):
    case_id: str
    channel: str
    message: str
    truth_label: TruthLabel
    status: str


class Provider(ManagedRecord):
    name: str
    shop_address: str | None
    latitude: float | None
    longitude: float | None
    trade: str
    status: str


class CaseDetail(CaseSummary):
    events: list[CaseEvent]
    approvals: list[Approval]
    evidence: list[Evidence]
    decisions: list[Decision]


class AssetDetail(Output):
    asset: Asset
    cases: list[CaseSummary]


class CaseCreate(Input):
    asset_id: Identifier
    complaint: Text


class EventCreate(Input):
    type: Literal["customer_note", "emergency"]
    detail: Text


class ApprovalResolve(Input):
    kind: Kind
    decision: Literal["approved", "rejected"]


class ApprovalRequest(Input):
    kind: Literal["change_provider", "share_sensitive"]
    reason: Text
    target_provider_id: Identifier | None = None

    @model_validator(mode="after")
    def scope_required(self):
        if self.kind == "change_provider" and self.target_provider_id is None:
            raise ValueError("A provider change requires target_provider_id")
        if self.kind == "share_sensitive" and self.target_provider_id is not None:
            raise ValueError(
                "Sensitive sharing uses a server-defined minimal payload, not a target provider"
            )
        return self


class ActionRequest(Input):
    action: Literal["payment", "share_sensitive", "change_provider"]


class Confirmation(Input):
    confirmed: StrictBool
    note: Text


class SignupCreate(Input):
    name: Annotated[str, Field(min_length=1, max_length=120)]
    email: Annotated[str, Field(min_length=3, max_length=254)]
    consent: StrictBool

    @field_validator("email")
    @classmethod
    def valid_email(cls, value: str) -> str:
        # Intentionally local validation: never performs DNS or delivery checks.
        if not re.fullmatch(
            r"[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+",
            value,
        ):
            raise ValueError("Enter a valid email address")
        local, domain = value.rsplit("@", 1)
        if len(local) > 64 or local.startswith(".") or local.endswith(".") or ".." in local:
            raise ValueError("Enter a valid email address")
        if any(len(label) > 63 for label in domain.split(".")):
            raise ValueError("Enter a valid email address")
        return value.lower()

    @field_validator("consent")
    @classmethod
    def explicit_consent(cls, value: bool) -> bool:
        if value is not True:
            raise ValueError("Explicit consent is required")
        return value


class SignupResult(Output):
    id: str
    message: str


class SimulationState(Output):
    step: int
    total_steps: Literal[6] = 6
    next_event: str | None
    complete: bool
    case_id: Literal["RK-2048"] = "RK-2048"


class Rail(Output):
    name: str
    description: str
    mode: Literal["mock"]
    truth_label: TruthLabel
    operations: list[str]


class Health(Output):
    status: Literal["ok"] = "ok"
    connector_mode: Literal["mock"] = "mock"


class SystemPrompt(Output):
    prompt: str
