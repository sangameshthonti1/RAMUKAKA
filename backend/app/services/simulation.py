from datetime import timedelta

from sqlalchemy.orm import Session

from app.core.errors import WorkflowError
from app.core.types import SIMULATED
from app.models import ServiceCase, SimulationState
from app.schemas.api import SimulationState as StateResponse
from app.seed.demo import BASE_TIME, DEMO_CASE_ID, seed_demo
from app.services.approvals import (
    approvals,
    approved_spend,
    deny,
    perform,
    resolve,
    share_scope,
    spend_scope,
)
from app.services.audit import Audit
from app.services.lifecycle import close, confirm, record_service

STEPS = (
    "customer approval",
    "provider assignment",
    "service evidence",
    "provider completion",
    "household confirmation",
    "final closure",
)


def state(session: Session) -> StateResponse:
    progress = session.get(SimulationState, DEMO_CASE_ID)
    if progress is None:
        raise WorkflowError(409, "Demo is not initialized; reset the simulation first")
    return StateResponse(
        step=progress.step,
        next_event=STEPS[progress.step] if progress.step < 6 else None,
        complete=progress.step == 6,
    )


def reset(session: Session) -> StateResponse:
    seed_demo(session, reset=True)
    return state(session)


def advance(session: Session) -> StateResponse:
    current = state(session)
    case = session.get(ServiceCase, DEMO_CASE_ID)
    if case is None or not case.demo:
        raise WorkflowError(409, "Simulation requires the dedicated demo case")
    if current.complete:
        return current
    progress = session.get(SimulationState, DEMO_CASE_ID)
    index = progress.step
    audit = Audit(
        session,
        case,
        SIMULATED,
        at=max(
            BASE_TIME + timedelta(minutes=index + 1), case.updated_at + timedelta(milliseconds=1)
        ),
        namespace=f"step-{index + 1}",
    )
    if case.provider_unresolved or case.household_unresolved:
        deny(
            audit,
            409,
            "Unresolved service requires a new local human confirmation before simulation can continue",
            "simulation_next",
            "UNRESOLVED_REQUIRES_HUMAN_REVIEW",
        )
    current_spend = [a for a in approvals(session, case, "spend") if a.scope == spend_scope(case)]
    rejected = any(a.status == "rejected" for a in current_spend)
    for kind in ("share_sensitive", "change_provider"):
        latest = next(iter(approvals(session, case, kind)), None)
        if latest and latest.status == "rejected":
            matches = (
                latest.scope == share_scope(case)
                if kind == "share_sensitive"
                else latest.scope.get("service_revision") == case.service_revision
                and latest.scope.get("from_provider_id") == case.provider_id
            )
            rejected = rejected or matches
    if rejected:
        deny(
            audit,
            409,
            "A current-scope approval was rejected; simulation cannot reapprove it",
            "simulation_next",
            "REJECTION_BLOCKS_SIMULATION",
        )
    if index > 0 and not approved_spend(session, case):
        deny(
            audit,
            409,
            "Current service approval is required to progress",
            "simulation_next",
            "APPROVED_SERVICE_REQUIRED",
        )
    if index == 0:
        if not approved_spend(session, case):
            resolve(audit, "spend", "approved", add_event=False)
        else:
            audit.decision(
                "customer_approval",
                "An existing matching approval was retained.",
                "PRESERVE_EXISTING_APPROVAL",
            )
        audit.event(
            "customer_approval",
            "Customer approval",
            "Documentary progression recorded the scoped spend authorization; no live payment occurred.",
        )
    elif index == 1:
        perform(audit, "payment", add_event=False)
        audit.event(
            "provider_assignment",
            "Provider assignment",
            "Approved service was assigned and payment was recorded only in local mocks.",
        )
    elif index == 2:
        record_service(audit)
        audit.event(
            "service_evidence",
            "Service evidence",
            "Documentary fixture recorded service work and a successful water-flow check.",
        )
    elif index == 3:
        confirm(
            audit,
            "provider",
            True,
            "Documentary provider completion.",
            defer_closure=True,
            add_event=False,
        )
        audit.event(
            "provider_completion",
            "Provider completion",
            "The simulated provider confirmed the documented service.",
        )
    elif index == 4:
        confirm(
            audit,
            "household",
            True,
            "Documentary household confirmation.",
            defer_closure=True,
            add_event=False,
        )
        audit.event(
            "household_confirmation",
            "Household confirmation",
            "The simulated household confirmed; final closure remains a separate guarded step.",
        )
    else:
        close(audit, required=True, add_event=False)
        audit.event(
            "closure",
            "Final closure",
            "Both-party confirmation and supporting service evidence passed the closure guard.",
        )
    audit.decision(
        "simulation_next",
        "Advanced one deterministic documentary step without external effects.",
        "ONE_DOCUMENTARY_STEP",
    )
    audit.touch()
    progress.step += 1
    progress.updated_at = audit.at
    session.flush()
    return state(session)
