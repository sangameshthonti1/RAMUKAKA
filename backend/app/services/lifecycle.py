from sqlalchemy import select

from app.models import Evidence
from app.services.approvals import approved_spend, deny
from app.services.audit import Audit


def service_ready(audit: Audit) -> bool:
    case, session = audit.case, audit.session
    return bool(
        case.assigned
        and approved_spend(session, case)
        and session.scalar(
            select(Evidence.id)
            .where(
                Evidence.case_id == case.id,
                Evidence.kind == "service",
                Evidence.service_revision == case.service_revision,
                Evidence.provider_id == case.provider_id,
            )
            .limit(1)
        )
    )


def record_service(audit: Audit):
    case = audit.case
    if not case.assigned or not approved_spend(audit.session, case):
        deny(
            audit,
            409,
            "Service evidence requires approved and assigned service",
            "service_evidence",
            "APPROVED_SERVICE_REQUIRED",
        )
    if case.status == "closed":
        deny(
            audit,
            409,
            "Cannot add service evidence to a closed case",
            "service_evidence",
            "OPEN_CASE_REQUIRED",
        )
    if not service_ready(audit):
        audit.call(
            "Local coordinator",
            "record_service_evidence",
            {"case_id": case.id, "provider_id": case.provider_id},
        )
        audit.evidence(
            "Documentary service report",
            "Mock technician fixture: filter replaced and water-flow check passed. Not a real visit.",
            "Local coordinator / documentary service fixture",
            service=True,
        )
    case.status = "awaiting_confirmation"
    audit.decision(
        "service_evidence",
        "Service evidence is tied to the current provider and service revision.",
        "CURRENT_SERVICE_EVIDENCE",
    )
    audit.touch()


def closure_allowed(audit: Audit) -> bool:
    return audit.case.provider_confirmed and audit.case.household_confirmed and service_ready(audit)


def close(audit: Audit, *, required: bool = False, add_event: bool = True):
    case = audit.case
    if not closure_allowed(audit):
        if required:
            deny(
                audit,
                409,
                "Closure requires both confirmations and evidence of approved assigned service",
                "close_case",
                "BOTH_PARTIES_AND_SERVICE_EVIDENCE",
            )
        return
    if case.status == "closed":
        return
    case.status = "closed"
    audit.decision(
        "close_case",
        "Both parties confirmed the current approved service with matching service evidence.",
        "BOTH_PARTIES_AND_SERVICE_EVIDENCE",
    )
    if add_event:
        audit.event(
            "closure",
            "Case closed",
            "Both parties confirmed; supporting service evidence is present.",
        )
    audit.notify("case_closed", "Local demo: case closed after both-party confirmation.", "Email")
    audit.touch()


def confirm(
    audit: Audit,
    party: str,
    confirmed: bool,
    note: str,
    *,
    defer_closure: bool = False,
    add_event: bool = True,
):
    case = audit.case
    if not service_ready(audit):
        deny(
            audit,
            409,
            "Confirmation requires evidence of approved assigned service",
            party + "_confirmation",
            "CURRENT_SERVICE_EVIDENCE",
        )
    setattr(case, party + "_confirmed", confirmed)
    setattr(case, party + "_unresolved", not confirmed)
    if not confirmed:
        case.status = "reopened"
        audit.decision(
            party + "_confirmation",
            "A party reported unresolved service; its confirmation was cleared and the case reopened.",
            "UNRESOLVED_REOPENS",
        )
    else:
        if case.status != "closed":
            case.status = (
                "reopened"
                if case.provider_unresolved or case.household_unresolved
                else "awaiting_confirmation"
            )
        audit.decision(
            party + "_confirmation",
            "A party confirmed service backed by current service evidence.",
            "EVIDENCE_BEFORE_CONFIRMATION",
        )
    if add_event:
        audit.event(
            party + ("_confirmed" if confirmed else "_unresolved"),
            party.capitalize() + (" confirmed" if confirmed else " reported unresolved service"),
            note,
        )
    if confirmed and not defer_closure:
        close(audit)
    audit.touch()


def customer_event(audit: Audit, event_type: str, detail: str):
    audit.event(
        event_type,
        "Customer note" if event_type == "customer_note" else "Emergency reported",
        detail,
    )
    if event_type == "emergency":
        audit.decision(
            "emergency",
            "Emergency recorded locally only. No emergency dispatch or live assistance is available; contact local emergency services if needed.",
            "EMERGENCY_NO_DISPATCH",
        )
        audit.notify(
            "emergency_local_only",
            "Emergency recorded locally. No dispatch was made; use local emergency services if needed.",
        )
    else:
        audit.decision(
            "customer_note",
            "Untrusted note stored as text; no workflow state, evidence or authorization changed.",
            "GENERIC_EVENTS_CANNOT_ADVANCE_WORKFLOW",
        )
    audit.touch()
