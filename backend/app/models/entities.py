from datetime import date, datetime
from typing import Any

from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    Date,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.types import new_id, utcnow
from app.database.base import Base, UTCDateTime


class Record:
    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=new_id)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)


class ManagedRecord(Record):
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow, onupdate=utcnow)
    truth_label: Mapped[str] = mapped_column(String(32), default="DOCUMENTATION_SIMULATION")


class Household(ManagedRecord, Base):
    __tablename__ = "households"
    name: Mapped[str] = mapped_column(String(120))
    address: Mapped[str | None] = mapped_column(String(500), nullable=True)
    latitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    longitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    participants: Mapped[list["Participant"]] = relationship(
        order_by="Participant.id", lazy="selectin"
    )


class Participant(ManagedRecord, Base):
    __tablename__ = "participants"
    household_id: Mapped[str] = mapped_column(ForeignKey("households.id"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    role: Mapped[str] = mapped_column(String(32))


class Asset(ManagedRecord, Base):
    __tablename__ = "assets"
    category: Mapped[str] = mapped_column(String(64), default="water_purifier")
    household_id: Mapped[str] = mapped_column(ForeignKey("households.id"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    brand: Mapped[str] = mapped_column(String(120))
    model: Mapped[str] = mapped_column(String(120))
    location: Mapped[str] = mapped_column(String(120))
    installed_on: Mapped[date] = mapped_column(Date)
    purchased_on: Mapped[date | None] = mapped_column(Date, nullable=True)
    warranty_until: Mapped[date | None] = mapped_column(Date, nullable=True)
    next_service_on: Mapped[date | None] = mapped_column(Date, nullable=True)
    serial_number: Mapped[str | None] = mapped_column(String(120), nullable=True)
    notes: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(32), default="active")


class Provider(ManagedRecord, Base):
    __tablename__ = "providers"
    name: Mapped[str] = mapped_column(String(120))
    trade: Mapped[str] = mapped_column(String(64))
    shop_address: Mapped[str | None] = mapped_column(String(500), nullable=True)
    latitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    longitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    status: Mapped[str] = mapped_column(String(32), default="available")


class ServiceCase(Record, Base):
    __tablename__ = "cases"
    __table_args__ = (
        CheckConstraint("quote_amount IS NULL OR quote_amount >= 0", name="ck_case_quote"),
    )
    household_id: Mapped[str] = mapped_column(ForeignKey("households.id"), index=True)
    asset_id: Mapped[str] = mapped_column(ForeignKey("assets.id"), index=True)
    title: Mapped[str] = mapped_column(String(160))
    complaint: Mapped[str] = mapped_column(Text)
    service_category: Mapped[str] = mapped_column(String(64), default="water_purifier")
    service_description: Mapped[str | None] = mapped_column(String(500), nullable=True)
    status: Mapped[str] = mapped_column(String(40), default="waiting_for_approval")
    quote_amount: Mapped[int | None] = mapped_column(Integer, nullable=True)
    provider_id: Mapped[str | None] = mapped_column(ForeignKey("providers.id"), nullable=True)
    provider_confirmed: Mapped[bool] = mapped_column(Boolean, default=False)
    household_confirmed: Mapped[bool] = mapped_column(Boolean, default=False)
    provider_unresolved: Mapped[bool] = mapped_column(Boolean, default=False)
    household_unresolved: Mapped[bool] = mapped_column(Boolean, default=False)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow, onupdate=utcnow)
    assigned: Mapped[bool] = mapped_column(Boolean, default=False)
    service_revision: Mapped[int] = mapped_column(Integer, default=1)
    demo: Mapped[bool] = mapped_column(Boolean, default=False)


class CaseRecord(Record):
    case_id: Mapped[str] = mapped_column(ForeignKey("cases.id", ondelete="CASCADE"), index=True)


class CaseEvent(CaseRecord, Base):
    __tablename__ = "case_events"
    type: Mapped[str] = mapped_column(String(64))
    title: Mapped[str] = mapped_column(String(160))
    detail: Mapped[str] = mapped_column(Text)
    truth_label: Mapped[str] = mapped_column(String(32))


class Approval(CaseRecord, Base):
    __tablename__ = "approvals"
    __table_args__ = (
        CheckConstraint(
            "kind IN ('spend','change_provider','share_sensitive')", name="ck_approval_kind"
        ),
        CheckConstraint("status IN ('pending','approved','rejected')", name="ck_approval_status"),
        CheckConstraint("amount IS NULL OR amount >= 0", name="ck_approval_amount"),
    )
    kind: Mapped[str] = mapped_column(String(32))
    status: Mapped[str] = mapped_column(String(32), default="pending")
    amount: Mapped[int | None] = mapped_column(Integer, nullable=True)
    reason: Mapped[str] = mapped_column(Text)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow, onupdate=utcnow)
    scope: Mapped[dict[str, Any]] = mapped_column(JSON)
    consumed: Mapped[bool] = mapped_column(Boolean, default=False)


class Evidence(CaseRecord, Base):
    __tablename__ = "evidence"
    title: Mapped[str] = mapped_column(String(160))
    description: Mapped[str] = mapped_column(Text)
    truth_label: Mapped[str] = mapped_column(String(32))
    source: Mapped[str] = mapped_column(String(80))
    kind: Mapped[str] = mapped_column(String(32), default="context")
    service_revision: Mapped[int | None] = mapped_column(Integer, nullable=True)
    provider_id: Mapped[str | None] = mapped_column(ForeignKey("providers.id"), nullable=True)


class Decision(CaseRecord, Base):
    __tablename__ = "decisions"
    action: Mapped[str] = mapped_column(String(80))
    reason: Mapped[str] = mapped_column(Text)
    rule: Mapped[str] = mapped_column(String(100))
    truth_label: Mapped[str] = mapped_column(String(32))


class ConnectorCall(CaseRecord, Base):
    __tablename__ = "connector_calls"
    connector: Mapped[str] = mapped_column(String(64))
    operation: Mapped[str] = mapped_column(String(64))
    request: Mapped[dict[str, Any]] = mapped_column(JSON)
    response: Mapped[dict[str, Any]] = mapped_column(JSON)
    truth_label: Mapped[str] = mapped_column(String(32))
    status: Mapped[str] = mapped_column(String(32))


class Notification(CaseRecord, Base):
    __tablename__ = "notifications"
    channel: Mapped[str] = mapped_column(String(32))
    message: Mapped[str] = mapped_column(Text)
    truth_label: Mapped[str] = mapped_column(String(32))
    status: Mapped[str] = mapped_column(String(32))


class ActionReceipt(CaseRecord, Base):
    __tablename__ = "action_receipts"
    __table_args__ = (UniqueConstraint("approval_id", name="uq_receipt_approval"),)
    approval_id: Mapped[str] = mapped_column(ForeignKey("approvals.id", ondelete="CASCADE"))
    action: Mapped[str] = mapped_column(String(32))
    connector_call_id: Mapped[str | None] = mapped_column(
        ForeignKey("connector_calls.id"), nullable=True
    )


class Signup(Record, Base):
    __tablename__ = "signups"
    name: Mapped[str] = mapped_column(String(120))
    email: Mapped[str] = mapped_column(String(254), unique=True)
    consent: Mapped[bool] = mapped_column(Boolean)


class ChatConversation(Record, Base):
    __tablename__ = "chat_conversations"
    household_id: Mapped[str] = mapped_column(ForeignKey("households.id"), index=True)
    case_id: Mapped[str | None] = mapped_column(
        ForeignKey("cases.id", ondelete="SET NULL"), nullable=True
    )
    asset_id: Mapped[str | None] = mapped_column(ForeignKey("assets.id"), nullable=True)
    draft_complaint: Mapped[str | None] = mapped_column(Text, nullable=True)
    stage: Mapped[str] = mapped_column(String(32), default="ready")
    status: Mapped[str] = mapped_column(String(32), default="open")
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow, onupdate=utcnow)


class ChatMessage(Record, Base):
    __tablename__ = "chat_messages"
    conversation_id: Mapped[str] = mapped_column(
        ForeignKey("chat_conversations.id", ondelete="CASCADE"), index=True
    )
    role: Mapped[str] = mapped_column(String(24))
    content: Mapped[str] = mapped_column(Text)
    truth_label: Mapped[str] = mapped_column(String(32))
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)


class RepairCoordination(Record, Base):
    __tablename__ = "repair_coordinations"
    case_id: Mapped[str] = mapped_column(ForeignKey("cases.id", ondelete="CASCADE"), unique=True)
    state: Mapped[dict[str, Any]] = mapped_column(JSON)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow, onupdate=utcnow)


class ServiceSchedule(Record, Base):
    __tablename__ = "service_schedules"
    __table_args__ = (
        CheckConstraint("revision >= 1", name="ck_schedule_revision"),
        CheckConstraint("status IN ('active','cancelled')", name="ck_schedule_status"),
        CheckConstraint("created_by IN ('household','provider')", name="ck_schedule_creator"),
        CheckConstraint("updated_by IN ('household','provider')", name="ck_schedule_updater"),
    )
    asset_id: Mapped[str] = mapped_column(ForeignKey("assets.id"), unique=True)
    household_id: Mapped[str] = mapped_column(ForeignKey("households.id"), index=True)
    provider_id: Mapped[str] = mapped_column(ForeignKey("providers.id"), index=True)
    case_id: Mapped[str | None] = mapped_column(
        ForeignKey("cases.id", ondelete="SET NULL"), nullable=True
    )
    next_service_on: Mapped[date] = mapped_column(Date, index=True)
    status: Mapped[str] = mapped_column(String(32), default="active")
    revision: Mapped[int] = mapped_column(Integer, default=1)
    note: Mapped[str] = mapped_column(Text, default="")
    created_by: Mapped[str] = mapped_column(String(32))
    updated_by: Mapped[str] = mapped_column(String(32))
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow, onupdate=utcnow)


class ServiceReminder(Record, Base):
    __tablename__ = "service_reminders"
    __table_args__ = (
        UniqueConstraint("schedule_id", "revision", "stage", "audience", name="uq_reminder"),
        CheckConstraint("stage IN ('upcoming','due')", name="ck_reminder_stage"),
        CheckConstraint("audience IN ('household','provider')", name="ck_reminder_audience"),
        CheckConstraint(
            "status IN ('available','acknowledged','superseded','cancelled')",
            name="ck_reminder_status",
        ),
    )
    schedule_id: Mapped[str] = mapped_column(
        ForeignKey("service_schedules.id", ondelete="CASCADE"), index=True
    )
    revision: Mapped[int] = mapped_column(Integer)
    stage: Mapped[str] = mapped_column(String(32))
    audience: Mapped[str] = mapped_column(String(32))
    household_id: Mapped[str] = mapped_column(ForeignKey("households.id"), index=True)
    provider_id: Mapped[str] = mapped_column(ForeignKey("providers.id"), index=True)
    next_service_on: Mapped[date] = mapped_column(Date)
    message: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(32), default="available")
    acknowledged_at: Mapped[datetime | None] = mapped_column(UTCDateTime(), nullable=True)


class ServiceContact(Record, Base):
    __tablename__ = "service_contacts"
    schedule_id: Mapped[str] = mapped_column(
        ForeignKey("service_schedules.id", ondelete="CASCADE"), index=True
    )
    revision: Mapped[int] = mapped_column(Integer)
    provider_id: Mapped[str] = mapped_column(ForeignKey("providers.id"))
    kind: Mapped[str] = mapped_column(String(32))
    content: Mapped[str] = mapped_column(Text)
    __table_args__ = (
        CheckConstraint("kind IN ('local_message','contact_note')", name="ck_contact_kind"),
    )


class SimulationState(Base):
    __tablename__ = "simulation_states"
    case_id: Mapped[str] = mapped_column(
        ForeignKey("cases.id", ondelete="CASCADE"), primary_key=True
    )
    step: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow, onupdate=utcnow)
    __table_args__ = (CheckConstraint("step >= 0 AND step <= 6", name="ck_simulation_step"),)
