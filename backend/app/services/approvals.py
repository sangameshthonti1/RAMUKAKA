from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import WorkflowError
from app.models import ActionReceipt, Approval, Provider, ServiceCase
from app.services.audit import Audit


def deny(audit: Audit, status: int, detail: str, action: str, rule: str):
    raise WorkflowError(
        status, detail, case_id=audit.case.id, action=action, rule=rule, truth_label=audit.truth
    )


def spend_scope(case: ServiceCase) -> dict:
    return {
        "asset_id": case.asset_id,
        "provider_id": case.provider_id,
        "amount": case.quote_amount,
        "service_revision": case.service_revision,
    }


def share_scope(case: ServiceCase) -> dict:
    return {
        "case_id": case.id,
        "asset_id": case.asset_id,
        "provider_id": case.provider_id,
        "issue_category": case.service_category + "_service",
        "access_window": "contact_household_in_app",
    }


def approvals(session: Session, case: ServiceCase, kind: str):
    return list(
        session.scalars(
            select(Approval)
            .where(Approval.case_id == case.id, Approval.kind == kind)
            .order_by(Approval.created_at.desc(), Approval.id.desc())
        )
    )


def approved_spend(session: Session, case: ServiceCase) -> Approval | None:
    return next(
        (
            a
            for a in approvals(session, case, "spend")
            if a.status == "approved"
            and a.scope == spend_scope(case)
            and a.amount == case.quote_amount
        ),
        None,
    )


def new_spend(audit: Audit) -> Approval:
    case = audit.case
    approval = audit.record(
        Approval,
        kind="spend",
        status="pending",
        amount=case.quote_amount,
        reason=f"Approve {'the documentary' if case.demo else 'the locally submitted'} INR {case.quote_amount} quote: {case.service_description or 'recorded service'}. Authorization is limited to the selected provider and service revision.",
        scope=spend_scope(case),
        consumed=False,
        updated_at=audit.at,
    )
    audit.decision(
        "request_spend",
        "Spending requires explicit approval of the exact quote and provider.",
        "EXACT_SPEND_SCOPE",
    )
    return approval


def resolve(audit: Audit, kind: str, decision: str, *, add_event: bool = True):
    case, session = audit.case, audit.session
    if case.status in {"closed", "cancelled"}:
        deny(
            audit,
            409,
            "Closed or cancelled cases cannot resolve approvals",
            "resolve_approval",
            "OPEN_CASE_REQUIRED",
        )
    pending = [a for a in approvals(session, case, kind) if a.status == "pending"]
    if not pending:
        deny(
            audit,
            409,
            "No pending approval of this kind",
            "resolve_approval",
            "EXISTING_PENDING_APPROVAL",
        )
    approval = pending[0]
    if kind == "spend" and (
        approval.scope != spend_scope(case) or approval.amount != case.quote_amount
    ):
        deny(audit, 409, "Approval scope is stale", "resolve_approval", "EXACT_SPEND_SCOPE")
    approval.status = decision
    approval.updated_at = audit.at
    if kind == "spend":
        case.status = "approved" if decision == "approved" else "approval_rejected"
    audit.decision(
        "resolve_approval",
        f"Existing {kind} approval was {decision}; scope was not expanded.",
        "EXPLICIT_SCOPED_APPROVAL",
    )
    if add_event:
        audit.event(
            "approval_" + decision,
            "Approval " + decision,
            f"The existing {kind} request was {decision}.",
        )
    audit.touch()
    return approval


def request_approval(audit: Audit, kind: str, reason: str, target_provider_id: str | None):
    case, session = audit.case, audit.session
    if case.status in {"closed", "cancelled"}:
        deny(
            audit,
            409,
            "Closed or cancelled cases cannot request actions",
            "request_approval",
            "OPEN_CASE_REQUIRED",
        )
    if any(
        a.status == "pending" or (a.status == "approved" and not a.consumed)
        for a in approvals(session, case, kind)
    ):
        deny(
            audit,
            409,
            "An unconsumed request of this kind already exists",
            "request_approval",
            "ONE_ACTIVE_SCOPE",
        )
    if kind == "change_provider":
        if case.provider_id is None or case.quote_amount is None:
            deny(
                audit,
                409,
                "Record an initial quote before requesting a provider change",
                "request_approval",
                "EXPLICIT_QUOTE_REQUIRED",
            )
        provider = session.get(Provider, target_provider_id)
        if provider is None:
            deny(
                audit,
                404,
                "Target provider not found",
                "request_approval",
                "KNOWN_PROVIDER_REQUIRED",
            )
        if provider.status != "available" or provider.trade != case.service_category:
            deny(
                audit,
                409,
                "Target provider is not eligible",
                "request_approval",
                "ELIGIBLE_PROVIDER_REQUIRED",
            )
        if provider.id == case.provider_id:
            deny(
                audit,
                409,
                "Provider is already selected",
                "request_approval",
                "DIFFERENT_PROVIDER_REQUIRED",
            )
        scope = {
            "from_provider_id": case.provider_id,
            "target_provider_id": provider.id,
            "service_revision": case.service_revision,
        }
    else:
        if case.provider_id is None:
            deny(
                audit,
                409,
                "A provider must be selected before requesting a data share",
                "request_approval",
                "EXPLICIT_QUOTE_REQUIRED",
            )
        scope = share_scope(case)
    audit.record(
        Approval,
        kind=kind,
        status="pending",
        amount=None,
        reason=reason,
        scope=scope,
        consumed=False,
        updated_at=audit.at,
    )
    audit.event(
        "approval_request",
        "Scoped approval requested",
        f"A {kind} request is awaiting a local decision.",
    )
    audit.decision(
        "request_approval",
        "Authorization is limited to the stored target or fixed minimal payload.",
        "IMMUTABLE_ACTION_SCOPE",
    )
    audit.touch()


def perform(audit: Audit, action: str, *, add_event: bool = True):
    case, session = audit.case, audit.session
    kind = "spend" if action == "payment" else action
    candidates = approvals(session, case, kind)
    approval = (
        approved_spend(session, case) if action == "payment" else next(iter(candidates), None)
    )
    if approval is None or approval.status != "approved":
        deny(
            audit,
            403,
            "An approved matching authorization is required",
            action,
            "APPROVAL_REQUIRED",
        )
    receipt = session.scalar(select(ActionReceipt).where(ActionReceipt.approval_id == approval.id))
    if approval.consumed:
        if action == "payment" and receipt and receipt.action == "payment":
            audit.decision(
                "payment_replay",
                "The existing mock payment receipt was reused; no second charge.",
                "IDEMPOTENT_PAYMENT",
            )
            return
        deny(
            audit,
            409,
            "This authorization has already been consumed",
            action,
            "SINGLE_USE_AUTHORIZATION",
        )
    if case.status in {"closed", "cancelled"}:
        deny(
            audit,
            409,
            "Closed or cancelled cases cannot execute new actions",
            action,
            "OPEN_CASE_REQUIRED",
        )
    if action == "payment":
        from app.models.entities import RepairCoordination

        coordination = session.scalar(
            select(RepairCoordination).where(RepairCoordination.case_id == case.id)
        )
        if coordination:
            state = coordination.state
            if (
                state["service_revision"] != case.service_revision
                or state["provider_id"] != case.provider_id
                or state["total_cost_inr"] != case.quote_amount
                or not state["cost_approved"]
                or not state["timing_approved"]
                or state["provider_response"] != "accepted"
            ):
                deny(
                    audit,
                    403,
                    "Current coordination requires household cost and timing consent and provider acceptance",
                    action,
                    "EXACT_COST_AND_TIMING_CONSENT",
                )
        provider = session.get(Provider, case.provider_id)
        if (
            provider is None
            or provider.status != "available"
            or provider.trade != case.service_category
        ):
            deny(
                audit, 409, "Selected provider is unavailable", action, "ELIGIBLE_PROVIDER_REQUIRED"
            )
        call = audit.call(
            "Pine Labs",
            "payment",
            {
                "case_id": case.id,
                "provider_id": case.provider_id,
                "approval_id": approval.id,
                "amount": approval.amount,
                "idempotency_key": "payment:" + approval.id,
            },
        )
        audit.call(
            "Delhivery", "assign_provider", {"case_id": case.id, "provider_id": case.provider_id}
        )
        case.assigned = True
        case.status = "assigned"
        audit.decision(
            "assign_provider",
            "Approved service was assigned through a documentary mock adapter.",
            "APPROVED_SERVICE_ASSIGNMENT",
        )
    elif action == "share_sensitive":
        if approval.scope != share_scope(case):
            deny(
                audit,
                403,
                "Share approval no longer matches the current scope",
                action,
                "IMMUTABLE_ACTION_SCOPE",
            )
        call = audit.call("WhatsApp", "share_sensitive", dict(approval.scope))
    else:
        scope = approval.scope
        if (
            scope.get("from_provider_id") != case.provider_id
            or scope.get("service_revision") != case.service_revision
        ):
            deny(audit, 403, "Provider-change approval is stale", action, "IMMUTABLE_ACTION_SCOPE")
        provider = session.get(Provider, scope.get("target_provider_id"))
        if (
            provider is None
            or provider.status != "available"
            or provider.trade != case.service_category
        ):
            deny(
                audit,
                409,
                "Approved target provider is unavailable",
                action,
                "ELIGIBLE_PROVIDER_REQUIRED",
            )
        call = audit.call(
            "Delhivery",
            "change_provider",
            {"case_id": case.id, "provider_id": provider.id, "approval_id": approval.id},
        )
        case.provider_id = provider.id
        case.service_revision += 1
        case.assigned = False
        case.provider_confirmed = False
        case.household_confirmed = False
        case.provider_unresolved = False
        case.household_unresolved = False
        case.status = "waiting_for_approval"
        for old in approvals(session, case, "spend"):
            if old.status == "pending":
                old.status = "rejected"
                old.updated_at = audit.at
        for old in approvals(session, case, "share_sensitive"):
            if old.status == "pending" or (old.status == "approved" and not old.consumed):
                old.status = "rejected"
                old.updated_at = audit.at
        if case.demo:
            new_spend(audit)
        else:
            # A newly selected provider cannot inherit another provider's price.
            case.quote_amount = None
            case.service_description = None
            case.status = "awaiting_quote"
        audit.decision(
            "invalidate_service",
            "Provider change invalidated assignment, evidence applicability, confirmations and old spending scope. Non-demo cases await an explicit new-provider quote.",
            "PROVIDER_CHANGE_REQUIRES_FRESH_SERVICE_APPROVAL",
        )
    approval.consumed = True
    approval.updated_at = audit.at
    session.flush()
    audit.record(ActionReceipt, approval_id=approval.id, action=action, connector_call_id=call.id)
    audit.decision(
        action,
        "The approved scope was used once by a local mock; no external effect occurred.",
        "CONSUME_EXACT_AUTHORIZATION",
    )
    if add_event:
        audit.event(
            "action_executed",
            "Local mock action recorded",
            f"Approved action: {action}. No live external effect.",
        )
    audit.touch()
