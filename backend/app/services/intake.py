from app.core.errors import WorkflowError
from app.core.types import HUMAN, new_id
from app.models import Asset, ServiceCase
from app.services.approvals import new_spend
from app.services.audit import Audit

DEMO_PROVIDER_ID = "provider-kent-care"


def initial_timeline(audit: Audit):
    case = audit.case
    audit.event(
        "report",
        "Low water flow reported",
        "A household reported low water flow from the water purifier.",
    )
    audit.call("Gnani", "intake", {"case_id": case.id, "asset_id": case.asset_id})
    audit.decision(
        "intake",
        "Intake retained locally; raw complaint text was not sent to any connector.",
        "LOCAL_INTAKE_ONLY",
    )
    audit.event(
        "classification",
        "Service classified",
        "Documentary fixture suggested filter replacement for low water flow; not a verified diagnosis or live AI inference.",
    )
    audit.call("AI", "classify", {"case_id": case.id, "asset_id": case.asset_id})
    audit.decision(
        "classify",
        "A fixed documentary classifier was used, not a live model.",
        "MOCK_CLASSIFICATION_ONLY",
    )
    audit.event(
        "asset_history",
        "Asset history reviewed",
        "Local asset installation details were reviewed; no external service history was fetched.",
    )
    audit.evidence(
        "Local asset record",
        "The seeded asset record documents the water purifier and installation date.",
        "Local documentary fixture",
    )
    audit.decision(
        "review_asset",
        "Only local documentary asset context is available.",
        "DOCUMENTARY_CONTEXT_NOT_SERVICE_PROOF",
    )
    audit.event(
        "provider_selection",
        "Provider selected",
        "A documentary water-purifier provider was selected; assignment requires approval.",
    )
    audit.decision(
        "select_provider",
        "Selected the deterministic demonstration provider without booking a real visit.",
        "MOCK_PROVIDER_SELECTION",
    )
    audit.event(
        "quote",
        "INR 749 documentary quote",
        "Suggested service: Filter replacement. Whole-INR fixture quote: 749. Not a live market quote.",
    )
    audit.decision(
        "quote",
        "The quote is a fixed documentary amount, not a live provider offer.",
        "DOCUMENTARY_QUOTE",
    )
    audit.event(
        "approval_request",
        "Spend approval required",
        "Explicit approval of INR 749 for the selected provider is required before service assignment or payment.",
    )
    new_spend(audit)
    audit.notify("approval_requested", "Local demo: an INR 749 service quote awaits approval.")
    audit.touch()


def create_case(session, asset_id: str, complaint: str):
    asset = session.get(Asset, asset_id)
    if asset is None:
        raise WorkflowError(404, "Asset not found")
    if asset.status != "active":
        raise WorkflowError(409, "Asset is not active")
    case = ServiceCase(
        id="RK-" + new_id(),
        household_id=asset.household_id,
        asset_id=asset.id,
        title=complaint[:160],
        complaint=complaint,
        status="awaiting_quote",
        quote_amount=None,
        provider_id=None,
        service_category=asset.category,
        service_description=None,
        provider_confirmed=False,
        household_confirmed=False,
        provider_unresolved=False,
        household_unresolved=False,
        assigned=False,
        service_revision=1,
        demo=False,
    )
    session.add(case)
    session.flush()
    human = Audit(session, case, HUMAN)
    human.event("report", "Customer complaint recorded", complaint)
    human.decision(
        "create_case",
        "A local human form created the case; no external delivery occurred.",
        "LOCAL_HUMAN_INTAKE",
    )
    human.decision(
        "await_provider_quote",
        "The asset category determines eligible providers. No diagnosis, quote or provider response was invented.",
        "EXPLICIT_QUOTE_REQUIRED",
    )
    human.touch()
    return case
