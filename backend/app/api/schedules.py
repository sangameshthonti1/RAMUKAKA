from typing import Annotated, Literal

from fastapi import APIRouter, Header, Query, Request
from sqlalchemy import select

from app import models as m
from app.api.routes import Database, DemoRole
from app.core.errors import WorkflowError
from app.core.types import utcnow
from app.schemas import schedules as s
from app.services import schedules as service
from app.services.workspace import get_record

router = APIRouter(prefix="/api", tags=["Local service schedules"])
ProviderAttribution = Annotated[str | None, Header(alias="X-Provider-ID", max_length=64)]
Limit = Annotated[int, Query(ge=1, le=200)]
Offset = Annotated[int, Query(ge=0)]


@router.post("/service-schedules", response_model=s.Schedule, status_code=201)
def create(
    body: s.Create, db: Database, role: DemoRole = None, provider: ProviderAttribution = None
):
    return service.create(db, body, role, provider)


@router.get("/service-schedules/{schedule_id}", response_model=s.Schedule)
def get_schedule(schedule_id: str, db: Database):
    return get_record(db, m.ServiceSchedule, schedule_id)


@router.patch("/service-schedules/{schedule_id}", response_model=s.Schedule)
def edit(
    schedule_id: str,
    body: s.Edit,
    db: Database,
    role: DemoRole = None,
    provider: ProviderAttribution = None,
):
    return service.edit(db, get_record(db, m.ServiceSchedule, schedule_id), body, role, provider)


def schedules_for(db, model, record_id, field, status, limit, offset):
    get_record(db, model, record_id)
    query = select(m.ServiceSchedule).where(field == record_id)
    if status:
        query = query.where(m.ServiceSchedule.status == status)
    return list(
        db.scalars(
            query.order_by(m.ServiceSchedule.next_service_on, m.ServiceSchedule.id)
            .limit(limit)
            .offset(offset)
        )
    )


@router.get("/households/{household_id}/service-schedules", response_model=list[s.Schedule])
def household_schedules(
    household_id: str,
    db: Database,
    status: Literal["active", "cancelled"] | None = None,
    limit: Limit = 100,
    offset: Offset = 0,
):
    return schedules_for(
        db, m.Household, household_id, m.ServiceSchedule.household_id, status, limit, offset
    )


@router.get("/providers/{provider_id}/service-schedules", response_model=list[s.Schedule])
def provider_schedules(
    provider_id: str,
    db: Database,
    status: Literal["active", "cancelled"] | None = None,
    limit: Limit = 100,
    offset: Offset = 0,
):
    return schedules_for(
        db, m.Provider, provider_id, m.ServiceSchedule.provider_id, status, limit, offset
    )


def reminders_for(db, model, record_id, field, audience, include_history, limit, offset):
    get_record(db, model, record_id)
    query = select(m.ServiceReminder).where(
        field == record_id, m.ServiceReminder.audience == audience
    )
    if not include_history:
        query = (
            query.join(m.ServiceSchedule)
            .join(m.Asset)
            .where(
                m.ServiceSchedule.status == "active",
                m.Asset.status == "active",
                m.ServiceReminder.revision == m.ServiceSchedule.revision,
                m.ServiceReminder.status.in_(["available", "acknowledged"]),
            )
        )
    return list(
        db.scalars(
            query.order_by(m.ServiceReminder.created_at, m.ServiceReminder.id)
            .limit(limit)
            .offset(offset)
        )
    )


@router.get("/households/{household_id}/service-reminders", response_model=list[s.Reminder])
def household_reminders(
    household_id: str,
    db: Database,
    include_history: bool = False,
    limit: Limit = 100,
    offset: Offset = 0,
):
    return reminders_for(
        db,
        m.Household,
        household_id,
        m.ServiceReminder.household_id,
        "household",
        include_history,
        limit,
        offset,
    )


@router.get("/providers/{provider_id}/service-reminders", response_model=list[s.Reminder])
def provider_reminders(
    provider_id: str,
    db: Database,
    include_history: bool = False,
    limit: Limit = 100,
    offset: Offset = 0,
):
    return reminders_for(
        db,
        m.Provider,
        provider_id,
        m.ServiceReminder.provider_id,
        "provider",
        include_history,
        limit,
        offset,
    )


@router.post("/service-reminders/check", response_model=s.CheckResult)
def check(body: s.Check, db: Database, request: Request):
    return service.process_due(
        db, body.as_of, batch_limit=request.app.state.settings.service_reminder_batch_size
    )


@router.post("/service-reminders/{reminder_id}/acknowledge", response_model=s.Reminder)
def acknowledge(
    reminder_id: str, db: Database, role: DemoRole = None, provider: ProviderAttribution = None
):
    reminder = get_record(db, m.ServiceReminder, reminder_id)
    schedule = get_record(db, m.ServiceSchedule, reminder.schedule_id)
    service.check_actor(db, schedule, role, provider)
    if role != reminder.audience:
        raise WorkflowError(403, "Select the reminder audience attribution")
    if (
        schedule.status != "active"
        or reminder.revision != schedule.revision
        or reminder.status not in {"available", "acknowledged"}
    ):
        raise WorkflowError(409, "Reminder is no longer current")
    if reminder.status == "available":
        reminder.status = "acknowledged"
        reminder.acknowledged_at = utcnow()
        db.flush()
    return reminder


@router.post("/service-schedules/{schedule_id}/contacts", response_model=s.Contact, status_code=201)
def contact(
    schedule_id: str,
    body: s.ContactCreate,
    db: Database,
    role: DemoRole = None,
    provider: ProviderAttribution = None,
):
    return service.record_contact(
        db, get_record(db, m.ServiceSchedule, schedule_id), body, role, provider
    )


@router.get("/service-schedules/{schedule_id}/contacts", response_model=list[s.Contact])
def contacts(schedule_id: str, db: Database, limit: Limit = 100, offset: Offset = 0):
    get_record(db, m.ServiceSchedule, schedule_id)
    return list(
        db.scalars(
            select(m.ServiceContact)
            .where(m.ServiceContact.schedule_id == schedule_id)
            .order_by(m.ServiceContact.created_at, m.ServiceContact.id)
            .limit(limit)
            .offset(offset)
        )
    )
