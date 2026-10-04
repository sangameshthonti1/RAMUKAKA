"""Deterministic local fixtures only: no network, geocoding, calls or real visits."""

from copy import deepcopy
from datetime import timedelta
from math import atan2, cos, radians, sin, sqrt

from sqlalchemy import select

from app import models as m
from app.core.errors import WorkflowError
from app.core.types import HUMAN, SIMULATED, new_id, utcnow
from app.models.entities import RepairCoordination
from app.schemas.workspace import QuoteCreate
from app.services import approvals, lifecycle, workspace
from app.services.audit import Audit


def stored(db, case_id):
    return db.scalar(select(RepairCoordination).where(RepairCoordination.case_id == case_id))


def result(record):
    return {
        "case_id": record.case_id,
        "state": record.state,
        "mode": "local_mock",
        "real_calls_supported": False,
    }


def nearest(db, case):
    household = db.get(m.Household, case.household_id)
    if household.latitude is None or household.longitude is None:
        raise WorkflowError(409, "Record household coordinates before searching local shops")
    shops = []
    for provider in db.scalars(
        select(m.Provider).where(
            m.Provider.trade == case.service_category, m.Provider.status == "available"
        )
    ):
        if provider.latitude is None or provider.longitude is None:
            continue
        lat1, lat2 = radians(household.latitude), radians(provider.latitude)
        dlat = lat2 - lat1
        dlon = radians(provider.longitude - household.longitude)
        a = sin(dlat / 2) ** 2 + cos(lat1) * cos(lat2) * sin(dlon / 2) ** 2
        a = min(1.0, max(0.0, a))
        distance = 6371.0088 * 2 * atan2(sqrt(a), sqrt(1 - a))
        shops.append(
            {
                "provider_id": provider.id,
                "name": provider.name,
                "shop_address": provider.shop_address,
                "latitude": provider.latitude,
                "longitude": provider.longitude,
                "distance_km": distance,
            }
        )
    return sorted(shops, key=lambda shop: (shop["distance_km"], shop["provider_id"]))


def current(db, case):
    record = stored(db, case.id)
    if record is None:
        raise WorkflowError(404, "Coordination not started")
    state = deepcopy(record.state)
    if (
        case.status in {"closed", "cancelled"}
        or state["service_revision"] != case.service_revision
        or state["provider_id"] != case.provider_id
        or state["total_cost_inr"] != case.quote_amount
    ):
        raise WorkflowError(409, "Coordination is stale or case is closed; refresh the case")
    return record, state


def save(record, state):
    record.state = deepcopy(state)
    record.updated_at = utcnow()
    return result(record)


def message(state, speaker, text):
    state["messages"].append({"speaker": speaker, "text": text, "truth_label": SIMULATED})


def start(db, case, expected_revision):
    old = stored(db, case.id)
    if old:
        current(db, case)
        if expected_revision != case.service_revision:
            raise WorkflowError(409, "Service revision changed; refresh the case")
        return result(old)
    if case.demo or case.assigned or case.status in {"closed", "cancelled"} or case.provider_id:
        raise WorkflowError(
            409, "Start coordination on a new unassigned case without a selected provider"
        )
    if expected_revision != case.service_revision:
        raise WorkflowError(409, "Service revision changed; refresh the case")
    shops = nearest(db, case)
    if not shops:
        raise WorkflowError(409, "No eligible local providers with recorded coordinates")
    shop = shops[0]
    audit = Audit(db, case, SIMULATED)
    # Fixed fixture, not a market estimate or a real provider quote.
    total = 1500
    workspace.submit_quote(
        audit,
        QuoteCreate(
            provider_id=shop["provider_id"],
            amount=total,
            service_description="Simulated local repair fixture, all-inclusive total; not a real quote",
            expected_revision=case.service_revision,
        ),
    )
    scheduled_start = (audit.at + timedelta(days=1)).replace(
        hour=10, minute=0, second=0, microsecond=0
    )
    scheduled_end = scheduled_start + timedelta(hours=2)
    state = {
        "status": "awaiting_household_consent",
        "offer_id": new_id(),
        "provider_id": case.provider_id,
        "service_revision": case.service_revision,
        "total_cost_inr": total,
        "timing": f"Simulated slot: {scheduled_start.isoformat()} to {scheduled_end.isoformat()} (UTC)",
        "scheduled_start": scheduled_start.isoformat(),
        "scheduled_end": scheduled_end.isoformat(),
        "cost_approved": False,
        "timing_approved": False,
        "provider_response": "accepted",
        "selected_shop": shop,
        "distance_method": "haversine_straight_line_recorded_coordinates",
        "messages": [],
    }
    message(
        state,
        "coordinator",
        "Simulated outreach to the nearest recorded eligible shop. No call or external search occurred.",
    )
    message(
        state,
        "provider",
        "Simulated provider: available for the mock slot; total INR 1500 including all fixture charges.",
    )
    message(
        state,
        "coordinator",
        "Household must explicitly approve both total cost and timing before mock assignment.",
    )
    record = RepairCoordination(case_id=case.id, state=state)
    db.add(record)
    audit.notify(
        "mock_offer",
        "Local simulation: repair offer awaits your cost and timing approval. No provider was contacted.",
    )
    db.flush()
    return result(record)


def consent(db, case, body):
    record, state = current(db, case)
    if body.offer_id != state["offer_id"]:
        raise WorkflowError(409, "Offer changed; refresh before consenting")
    if state["status"] == "assigned" and body.approve_cost and body.approve_timing:
        return result(record)
    if state["status"] != "awaiting_household_consent":
        raise WorkflowError(409, "This offer is not awaiting household consent")
    if not body.approve_cost or not body.approve_timing:
        # Do not accumulate separate partial decisions into full authorization.
        state["cost_approved"] = body.approve_cost
        state["timing_approved"] = body.approve_timing
        return save(record, state)
    if state["provider_response"] != "accepted":
        raise WorkflowError(409, "Provider has not accepted this offer")
    state["cost_approved"] = state["timing_approved"] = True
    save(record, state)
    audit = Audit(db, case, HUMAN)
    if not approvals.approved_spend(db, case):
        approvals.resolve(audit, "spend", "approved")
    approvals.perform(audit, "payment")
    state["status"] = "assigned"
    message(
        state,
        "coordinator",
        "Both cost and timing explicitly approved; local mock assignment recorded. No real payment or booking.",
    )
    return save(record, state)


def provider_response(db, case, body):
    record, state = current(db, case)
    if body.offer_id != state["offer_id"]:
        raise WorkflowError(409, "Offer changed; refresh before responding")
    if body.response == "complete":
        if state["status"] == "provider_reported_completion":
            return result(record)
        if state["status"] != "assigned" or not case.assigned:
            raise WorkflowError(409, "Completion requires the approved current assignment")
        audit = Audit(db, case, SIMULATED)
        audit.evidence(
            "Simulated provider completion report",
            "Deterministic mock provider reports fixture repair complete. No real visit or independent verification.",
            "Local mock coordinator",
            service=True,
        )
        case.household_confirmed = False
        case.provider_confirmed = False
        db.flush()
        lifecycle.confirm(
            audit, "provider", True, "Simulated provider completion", defer_closure=True
        )
        audit.notify(
            "mock_provider_complete",
            "Simulated provider reports completion. Please confirm or report unresolved service; this is not verified closure.",
        )
        state["status"] = "provider_reported_completion"
        message(
            state,
            "provider",
            "Simulated repair completion reported. Household confirmation still required.",
        )
    else:
        if state["status"] != "awaiting_household_consent":
            raise WorkflowError(409, "Cannot change a provider response after assignment")
        state["provider_response"] = "accepted" if body.response == "accept" else "declined"
        message(state, "provider", "Simulated provider response: " + body.response)
    return save(record, state)
