from sqlalchemy import select
from sqlalchemy.orm import Session

from app import models as m
from app.core.errors import WorkflowError
from app.core.types import HUMAN, utcnow
from app.schemas import workspace as s
from app.services.approvals import approvals, approved_spend, deny, new_spend
from app.services.audit import Audit


def get_record(db: Session, model, record_id: str):
    record = db.get(model, record_id)
    if record is None:
        raise WorkflowError(404, "Record not found")
    return record


def create_household(db: Session, body: s.HouseholdCreate):
    household = m.Household(**body.model_dump(exclude={"member_name"}), truth_label=HUMAN)
    db.add(household)
    db.flush()
    member = m.Participant(
        household_id=household.id, name=body.member_name, role="household", truth_label=HUMAN
    )
    db.add(member)
    db.flush()
    db.refresh(household)
    return household


def add_participant(db: Session, household_id: str, body: s.ParticipantCreate):
    household = get_record(db, m.Household, household_id)
    db.add(
        m.Participant(
            household_id=household_id, name=body.name, role="household", truth_label=HUMAN
        )
    )
    household.updated_at = utcnow()
    db.flush()
    db.refresh(household)
    return household


def create_asset(db: Session, body: s.AssetCreate):
    get_record(db, m.Household, body.household_id)
    asset = m.Asset(**body.model_dump(), status="active", truth_label=HUMAN)
    db.add(asset)
    db.flush()
    return asset


def edit_asset(db: Session, asset_id: str, body: s.AssetEdit):
    asset = get_record(db, m.Asset, asset_id)
    if body.status == "retired" and db.scalar(
        select(m.ServiceCase.id)
        .where(
            m.ServiceCase.asset_id == asset_id, m.ServiceCase.status.not_in(["closed", "cancelled"])
        )
        .limit(1)
    ):
        raise WorkflowError(409, "Close outstanding cases before retiring this asset")
    for key, value in body.model_dump().items():
        setattr(asset, key, value)
    asset.truth_label = HUMAN
    asset.updated_at = utcnow()
    db.flush()
    return asset


def create_provider(db: Session, body: s.ProviderCreate):
    provider = m.Provider(**body.model_dump(), status="available", truth_label=HUMAN)
    db.add(provider)
    db.flush()
    return provider


def edit_provider(db: Session, provider_id: str, body: s.ProviderEdit):
    provider = get_record(db, m.Provider, provider_id)
    for key, value in body.model_dump().items():
        setattr(provider, key, value)
    provider.truth_label = HUMAN
    provider.updated_at = utcnow()
    db.flush()
    return provider


def cancel_case(audit: Audit, body: s.CaseCancel):
    case = audit.case
    if case.demo:
        deny(
            audit,
            409,
            "The documentary case can only be reset from Simulation",
            "cancel_case",
            "PRESERVE_DEMO_SCENARIO",
        )
    if case.assigned or case.status in {"closed", "cancelled"}:
        deny(
            audit,
            409,
            "Only unassigned open cases may be cancelled",
            "cancel_case",
            "NO_CANCEL_AFTER_ASSIGNMENT",
        )
    for kind in ("spend", "share_sensitive", "change_provider"):
        for approval in approvals(audit.session, case, kind):
            if approval.status == "pending" or (
                approval.status == "approved" and not approval.consumed
            ):
                approval.status = "rejected"
                approval.updated_at = audit.at
    case.status = "cancelled"
    audit.event("cancelled", "Household cancelled this case", body.reason)
    audit.decision(
        "cancel_case",
        "The household ended an unassigned local case without claiming service completion; outstanding permissions were revoked.",
        "CANCEL_UNASSIGNED_ONLY",
    )
    audit.touch()


def submit_quote(audit: Audit, body: s.QuoteCreate):
    case, db = audit.case, audit.session
    if case.demo:
        deny(
            audit,
            409,
            "The documentary quote is fixed; create a new case for your own quote",
            "submit_quote",
            "PRESERVE_DEMO_SCENARIO",
        )
    if case.status in {"closed", "cancelled"} or case.assigned:
        deny(
            audit,
            409,
            "Assigned or closed work cannot be repriced; create a separate case for additional work",
            "submit_quote",
            "NO_REPRICE_AFTER_ASSIGNMENT",
        )
    if body.expected_revision != case.service_revision:
        deny(
            audit,
            409,
            "The service plan changed; refresh before submitting",
            "submit_quote",
            "CURRENT_SERVICE_REVISION",
        )
    provider = get_record(db, m.Provider, body.provider_id)
    if provider.status != "available" or provider.trade != case.service_category:
        deny(
            audit,
            409,
            "Provider is unavailable or does not match this asset category",
            "submit_quote",
            "ELIGIBLE_PROVIDER_REQUIRED",
        )
    if case.provider_id is not None and case.provider_id != provider.id:
        deny(
            audit,
            403,
            "Changing providers requires household approval through the scoped provider-change flow",
            "submit_quote",
            "PROVIDER_CHANGE_REQUIRES_APPROVAL",
        )
    # Revisions preserve previous authorization/history without letting it fund a revised plan.
    case.service_revision += 1
    case.provider_id = provider.id
    case.quote_amount = body.amount
    case.service_description = body.service_description
    case.status = "waiting_for_approval"
    for kind in ("spend", "share_sensitive", "change_provider"):
        for old in approvals(db, case, kind):
            if old.status == "pending" or (old.status == "approved" and not old.consumed):
                old.status = "rejected"
                old.updated_at = audit.at
    new_spend(audit)
    audit.event(
        "quote",
        "Provider quote recorded",
        f"Service: {body.service_description}. Quote: INR {body.amount}. Submitted locally; no payment has occurred.",
    )
    audit.event(
        "approval_request",
        "Household approval required",
        "Review the current service, provider and amount before authorizing mock assignment.",
    )
    audit.decision(
        "submit_quote",
        "An explicit local provider input created a new service revision and scoped spend request; previous authorizations cannot be reused.",
        "NEW_QUOTE_REQUIRES_FRESH_APPROVAL",
    )
    audit.touch()


def submit_service_report(audit: Audit, body: s.ServiceReportCreate):
    case = audit.case
    if case.status in {"closed", "cancelled"}:
        deny(
            audit,
            409,
            "Report an unresolved issue before adding follow-up evidence",
            "service_report",
            "OPEN_CASE_REQUIRED",
        )
    if body.provider_id != case.provider_id or body.expected_revision != case.service_revision:
        deny(
            audit,
            409,
            "Report does not match the assigned provider and service revision",
            "service_report",
            "CURRENT_SERVICE_REVISION",
        )
    if not case.assigned or not approved_spend(audit.session, case):
        deny(
            audit,
            403,
            "Service reports require approved and assigned service",
            "service_report",
            "APPROVED_SERVICE_REQUIRED",
        )
    proof_receipt = (
        f"\nProof receipt: {body.proof_file_name} ({body.proof_media_type}, "
        f"{body.proof_size_bytes} bytes), captured {body.proof_captured_at}, "
        f"SHA-256 {body.proof_sha256}"
    )
    source = (
        "Provider-supplied media receipt; file integrity is tamper-evident, "
        "but physical truth is not independently verified"
    )
    audit.record(
        m.Evidence,
        title="Provider service report",
        description=(
            f"Work performed: {body.work_performed}\n"
            f"Observed result: {body.observed_result}{proof_receipt}"
        ),
        source=source,
        truth_label=HUMAN,
        kind="service",
        provider_id=case.provider_id,
        service_revision=case.service_revision,
    )
    # New work/evidence must be verified again; old confirmations cannot close follow-up work.
    case.provider_confirmed = False
    case.household_confirmed = False
    case.status = (
        "reopened"
        if case.provider_unresolved or case.household_unresolved
        else "awaiting_confirmation"
    )
    audit.event(
        "service_report",
        "Provider service report submitted",
        "A local service report was added for the current assignment. Both parties must confirm this result separately.",
    )
    audit.decision(
        "record_service_report",
        "Stored a human claim with its provenance; not independent verification. Cleared earlier confirmations for renewed two-party review.",
        "NEW_SERVICE_REPORT_REQUIRES_BOTH_CONFIRMATIONS",
    )
    audit.touch()
