from datetime import date, datetime, timezone

from sqlalchemy import delete
from sqlalchemy.orm import Session

from app.core.errors import WorkflowError
from app.core.types import SIMULATED
from app.models import (
    ActionReceipt,
    Asset,
    Household,
    Participant,
    Provider,
    ServiceCase,
    SimulationState,
)
from app.services.audit import Audit
from app.services.intake import DEMO_PROVIDER_ID, initial_timeline

DEMO_CASE_ID = "RK-2048"
DEMO_ASSET_ID = "asset-kent-purifier"
DEMO_HOUSEHOLD_ID = "household-sangamesh"
BASE_TIME = datetime(2026, 1, 1, 9, 0, tzinfo=timezone.utc)


def seed_reference_data(session: Session):
    # Reference records may be used by unrelated cases. Reset never replaces them.
    if session.get(Household, DEMO_HOUSEHOLD_ID) is None:
        session.add(
            Household(id=DEMO_HOUSEHOLD_ID, name="Sangamesh's household", created_at=BASE_TIME)
        )
        session.flush()
    if session.get(Participant, "participant-sangamesh") is None:
        session.add(
            Participant(
                id="participant-sangamesh",
                household_id=DEMO_HOUSEHOLD_ID,
                name="Sangamesh",
                role="household",
                created_at=BASE_TIME,
            )
        )
    if session.get(Asset, DEMO_ASSET_ID) is None:
        session.add(
            Asset(
                id=DEMO_ASSET_ID,
                household_id=DEMO_HOUSEHOLD_ID,
                name="Kent water purifier",
                brand="Kent",
                model="Grand Plus (demo)",
                location="Kitchen",
                installed_on=date(2024, 6, 15),
                notes="Documentary demo asset; no real service history is claimed.",
                status="active",
                created_at=BASE_TIME,
            )
        )
    for provider_id, name in (
        (DEMO_PROVIDER_ID, "Kent Care (demo)"),
        ("provider-aqua-care", "Aqua Care (demo)"),
    ):
        if session.get(Provider, provider_id) is None:
            session.add(
                Provider(
                    id=provider_id,
                    name=name,
                    trade="water_purifier",
                    status="available",
                    created_at=BASE_TIME,
                )
            )
    session.flush()


def seed_demo(session: Session, *, reset: bool = False):
    seed_reference_data(session)
    existing = session.get(ServiceCase, DEMO_CASE_ID)
    if existing is not None and not existing.demo:
        raise WorkflowError(409, "RK-2048 is occupied by a non-demo case; refusing to replace it")
    if existing is not None and not reset:
        return existing
    if existing is not None:
        # Receipts refer to both approvals and calls; remove them before cascading
        # the case so SQLite never sees a transient restricted reference.
        session.execute(delete(ActionReceipt).where(ActionReceipt.case_id == DEMO_CASE_ID))
        session.delete(existing)
        session.flush()
        session.expire_all()
    case = ServiceCase(
        id=DEMO_CASE_ID,
        household_id=DEMO_HOUSEHOLD_ID,
        asset_id=DEMO_ASSET_ID,
        title="Low water flow",
        complaint="Low water flow",
        service_description="Filter replacement",
        status="waiting_for_approval",
        quote_amount=749,
        provider_id=DEMO_PROVIDER_ID,
        provider_confirmed=False,
        household_confirmed=False,
        provider_unresolved=False,
        household_unresolved=False,
        assigned=False,
        service_revision=1,
        demo=True,
        created_at=BASE_TIME,
        updated_at=BASE_TIME,
    )
    session.add(case)
    session.flush()
    session.add(
        SimulationState(case_id=DEMO_CASE_ID, step=0, created_at=BASE_TIME, updated_at=BASE_TIME)
    )
    audit = Audit(session, case, SIMULATED, at=BASE_TIME, namespace="initial")
    initial_timeline(audit)
    audit.decision(
        "demo_baseline",
        "Only demo-scoped workflow records belong to the deterministic reset boundary.",
        "RESET_DEMO_ONLY",
    )
    session.flush()
    return case
