import asyncio
import logging
from datetime import date, timedelta

from sqlalchemy import exists, or_, select
from sqlalchemy.orm import Session

from app import models as m
from app.core.errors import WorkflowError
from app.core.types import HUMAN, utcnow
from app.services.workspace import get_record

logger = logging.getLogger(__name__)


def require_role(role):
    if role not in {"household", "provider"}:
        raise WorkflowError(
            403, "Select household or provider attribution for this local operation"
        )


def attributed_provider(db, asset_id, case, provider_id):
    if provider_id:
        get_record(db, m.Provider, provider_id)
        return provider_id
    if case and case.assigned and case.provider_id and case.status != "cancelled":
        return case.provider_id
    assigned = set(
        db.scalars(
            select(m.ServiceCase.provider_id).where(
                m.ServiceCase.asset_id == asset_id,
                m.ServiceCase.assigned.is_(True),
                m.ServiceCase.status != "cancelled",
                m.ServiceCase.provider_id.is_not(None),
            )
        )
    )
    if len(assigned) != 1:
        raise WorkflowError(403, "Supply X-Provider-ID local attribution or an assigned case")
    return assigned.pop()


def check_actor(db, schedule, role, provider_id):
    require_role(role)
    if role == "provider":
        case = db.get(m.ServiceCase, schedule.case_id) if schedule.case_id else None
        actor = attributed_provider(db, schedule.asset_id, case, provider_id)
        if actor != schedule.provider_id:
            raise WorkflowError(403, "Provider attribution does not match this schedule")


def create(db: Session, body, role, provider_attribution):
    require_role(role)
    asset = get_record(db, m.Asset, body.asset_id)
    get_record(db, m.Household, body.household_id)
    if asset.household_id != body.household_id:
        raise WorkflowError(409, "Asset does not belong to this household")
    if asset.status != "active":
        raise WorkflowError(409, "Cannot schedule a retired asset")
    case = get_record(db, m.ServiceCase, body.case_id) if body.case_id else None
    if case and (case.asset_id != asset.id or case.household_id != body.household_id):
        raise WorkflowError(409, "Case does not match the scheduled asset and household")
    if case and (not case.assigned or not case.provider_id or case.status == "cancelled"):
        raise WorkflowError(409, "Use a relevant assigned, non-cancelled case")
    provider_id = body.provider_id or (case.provider_id if case else None)
    if role == "provider":
        actor = attributed_provider(db, asset.id, case, provider_attribution)
        provider_id = provider_id or actor
        if actor != provider_id:
            raise WorkflowError(403, "Provider attribution does not match the scheduled provider")
    if not provider_id:
        raise WorkflowError(422, "Supply provider_id or an assigned case_id")
    get_record(db, m.Provider, provider_id)
    if case and case.provider_id != provider_id:
        raise WorkflowError(409, "Provider does not match the assigned case")
    if db.scalar(select(m.ServiceSchedule.id).where(m.ServiceSchedule.asset_id == asset.id)):
        raise WorkflowError(409, "Asset already has a schedule; update or reactivate it")
    schedule = m.ServiceSchedule(
        household_id=body.household_id,
        asset_id=asset.id,
        provider_id=provider_id,
        case_id=body.case_id,
        next_service_on=body.next_service_on,
        note=body.note,
        created_by=role,
        updated_by=role,
    )
    db.add(schedule)
    asset.next_service_on = body.next_service_on
    asset.truth_label = HUMAN
    db.flush()
    return schedule


def require_revision(schedule, expected):
    if schedule.revision != expected:
        raise WorkflowError(409, "Schedule changed; reload and use the current revision")


def edit(db: Session, schedule, body, role, provider_attribution):
    check_actor(db, schedule, role, provider_attribution)
    require_revision(schedule, body.expected_revision)
    asset = get_record(db, m.Asset, schedule.asset_id)
    old_date, old_status = schedule.next_service_on, schedule.status
    changes = body.model_dump(exclude_unset=True, exclude={"expected_revision"})
    new_status = changes.get("status", old_status)
    if new_status == "active" and asset.status != "active":
        raise WorkflowError(409, "Cannot schedule a retired asset")
    for key, value in changes.items():
        setattr(schedule, key, value)
    # Notes do not start a new reminder cycle. A no-op reschedule is also idempotent.
    if (schedule.next_service_on, schedule.status) != (old_date, old_status):
        schedule.revision += 1
        for reminder in db.scalars(
            select(m.ServiceReminder).where(
                m.ServiceReminder.schedule_id == schedule.id,
                m.ServiceReminder.status.in_(["available", "acknowledged"]),
            )
        ):
            reminder.status = "cancelled" if new_status == "cancelled" else "superseded"
        # Respect an independently edited asset date rather than erasing newer user work.
        if asset.next_service_on == old_date or asset.next_service_on is None:
            asset.next_service_on = schedule.next_service_on if new_status == "active" else None
            asset.truth_label = HUMAN
    schedule.updated_by = role
    schedule.updated_at = utcnow()
    db.flush()
    return schedule


def process_due(db: Session, as_of: date | None = None, *, batch_limit=100):
    as_of = as_of or utcnow().date()
    upcoming_end = as_of + timedelta(days=min(7, (date.max - as_of).days))
    schedule, reminder = m.ServiceSchedule, m.ServiceReminder

    def missing(stage):
        return or_(
            *[
                ~exists(
                    select(reminder.id).where(
                        reminder.schedule_id == schedule.id,
                        reminder.revision == schedule.revision,
                        reminder.stage == stage,
                        reminder.audience == audience,
                    )
                )
                for audience in ("household", "provider")
            ]
        )

    # Filter already-processed schedules before LIMIT so older rows cannot starve later ones.
    candidates = list(
        db.scalars(
            select(schedule)
            .join(m.Asset)
            .where(
                schedule.status == "active",
                m.Asset.status == "active",
                or_(
                    (schedule.next_service_on <= as_of) & missing("due"),
                    (schedule.next_service_on > as_of)
                    & (schedule.next_service_on <= upcoming_end)
                    & missing("upcoming"),
                ),
            )
            .order_by(schedule.next_service_on, schedule.id)
            .limit(batch_limit)
        )
    )
    count = 0
    for item in candidates:
        stage = "due" if item.next_service_on <= as_of else "upcoming"
        asset = get_record(db, m.Asset, item.asset_id)
        provider = get_record(db, m.Provider, item.provider_id)
        for audience in ("household", "provider"):
            if db.scalar(
                select(reminder.id).where(
                    reminder.schedule_id == item.id,
                    reminder.revision == item.revision,
                    reminder.stage == stage,
                    reminder.audience == audience,
                )
            ):
                continue
            message = (
                f"Service for {asset.name} is {stage} on {item.next_service_on.isoformat()}. "
                + (
                    f"{provider.name} should contact your household to arrange service."
                    if audience == "household"
                    else "Please contact the customer to arrange service."
                )
                + " This is a local in-app reminder; no SMS or call was sent."
            )
            db.add(
                reminder(
                    schedule_id=item.id,
                    revision=item.revision,
                    stage=stage,
                    audience=audience,
                    household_id=item.household_id,
                    provider_id=item.provider_id,
                    next_service_on=item.next_service_on,
                    message=message,
                )
            )
            count += 1
    db.flush()
    return {
        "as_of": as_of,
        "schedules_processed": len(candidates),
        "reminders_created": count,
        "batch_limit": batch_limit,
        "external_effect": False,
    }


def record_contact(db, schedule, body, role, provider_attribution):
    if role != "provider":
        raise WorkflowError(403, "Select provider attribution for this local operation")
    check_actor(db, schedule, role, provider_attribution)
    require_revision(schedule, body.expected_revision)
    if schedule.status != "active":
        raise WorkflowError(409, "Cannot record contact for a cancelled schedule")
    contact = m.ServiceContact(
        schedule_id=schedule.id,
        revision=schedule.revision,
        provider_id=schedule.provider_id,
        kind=body.kind,
        content=body.content,
    )
    db.add(contact)
    for reminder in db.scalars(
        select(m.ServiceReminder).where(
            m.ServiceReminder.schedule_id == schedule.id,
            m.ServiceReminder.revision == schedule.revision,
            m.ServiceReminder.audience == "provider",
            m.ServiceReminder.status == "available",
        )
    ):
        reminder.status = "acknowledged"
        reminder.acknowledged_at = utcnow()
    db.flush()
    return contact


def run_check(factory, batch_limit):
    with factory() as db:
        result = process_due(db, batch_limit=batch_limit)
        db.commit()
        return result


async def reminder_worker(factory, stop: asyncio.Event, *, interval, batch_limit):
    while not stop.is_set():
        try:
            await asyncio.wait_for(stop.wait(), timeout=interval)
            return
        except TimeoutError:
            pass
        try:
            # One bounded transaction per tick; shutdown waits for it before disposing the engine.
            await asyncio.to_thread(run_check, factory, batch_limit)
        except Exception:
            logger.exception("Local service reminder check failed; retrying on next interval")
