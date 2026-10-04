from datetime import date, datetime
from typing import Literal

from pydantic import Field, model_validator

from app.schemas.api import Identifier, Input, Output, Record, Text


class Create(Input):
    household_id: Identifier
    asset_id: Identifier
    provider_id: Identifier | None = None
    case_id: Identifier | None = None
    next_service_on: date
    note: str = Field(default="", max_length=2000)


class Edit(Input):
    expected_revision: int = Field(ge=1)
    next_service_on: date | None = None
    status: Literal["active", "cancelled"] | None = None
    note: str | None = Field(default=None, max_length=2000)

    @model_validator(mode="after")
    def non_null_changes(self):
        changes = self.model_fields_set - {"expected_revision"}
        if not changes or any(getattr(self, field) is None for field in changes):
            raise ValueError("Supply at least one non-null change")
        return self


class Schedule(Record):
    household_id: str
    asset_id: str
    provider_id: str
    case_id: str | None
    next_service_on: date
    status: Literal["active", "cancelled"]
    revision: int
    note: str
    created_by: Literal["household", "provider"]
    updated_by: Literal["household", "provider"]
    updated_at: datetime


class Reminder(Record):
    schedule_id: str
    revision: int
    household_id: str
    provider_id: str
    next_service_on: date
    stage: Literal["upcoming", "due"]
    audience: Literal["household", "provider"]
    message: str
    status: Literal["available", "acknowledged", "superseded", "cancelled"]
    acknowledged_at: datetime | None
    channel: Literal["in_app"] = "in_app"
    external_effect: Literal[False] = False


class ContactCreate(Input):
    expected_revision: int = Field(ge=1)
    kind: Literal["local_message", "contact_note"]
    content: Text


class Contact(Record):
    schedule_id: str
    revision: int
    provider_id: str
    kind: Literal["local_message", "contact_note"]
    content: str
    status: Literal["local_recorded"] = "local_recorded"
    external_effect: Literal[False] = False


class Check(Input):
    as_of: date | None = None


class CheckResult(Output):
    as_of: date
    schedules_processed: int
    reminders_created: int
    batch_limit: int
    external_effect: Literal[False] = False
