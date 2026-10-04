from fastapi import APIRouter

from app.api.routes import Database, DemoRole, human_audit
from app.core.errors import WorkflowError
from app.schemas import api as out
from app.schemas import workspace as s
from app.services import workspace
from app.services.queries import case_detail

router = APIRouter(prefix="/api", tags=["Local workspace"])


def require_attribution(role: str | None, expected: str):
    # This is deliberately not described as authentication: local roles are caller-selected.
    if role != expected:
        raise WorkflowError(403, f"Select {expected} attribution for this local operation")


@router.post("/households", response_model=out.Household, status_code=201)
def create_household(body: s.HouseholdCreate, db: Database, role: DemoRole = None):
    require_attribution(role, "household")
    return workspace.create_household(db, body)


@router.post(
    "/households/{household_id}/participants", response_model=out.Household, status_code=201
)
def add_participant(
    household_id: str, body: s.ParticipantCreate, db: Database, role: DemoRole = None
):
    require_attribution(role, "household")
    return workspace.add_participant(db, household_id, body)


@router.post("/assets", response_model=out.Asset, status_code=201)
def create_asset(body: s.AssetCreate, db: Database, role: DemoRole = None):
    require_attribution(role, "household")
    return workspace.create_asset(db, body)


@router.patch("/assets/{asset_id}", response_model=out.Asset)
def edit_asset(asset_id: str, body: s.AssetEdit, db: Database, role: DemoRole = None):
    require_attribution(role, "household")
    return workspace.edit_asset(db, asset_id, body)


@router.post("/providers", response_model=out.Provider, status_code=201)
def create_provider(body: s.ProviderCreate, db: Database, role: DemoRole = None):
    require_attribution(role, "provider")
    return workspace.create_provider(db, body)


@router.patch("/providers/{provider_id}", response_model=out.Provider)
def edit_provider(provider_id: str, body: s.ProviderEdit, db: Database, role: DemoRole = None):
    require_attribution(role, "provider")
    return workspace.edit_provider(db, provider_id, body)


@router.post("/cases/{case_id}/cancel", response_model=out.CaseDetail)
def cancel_case(case_id: str, body: s.CaseCancel, db: Database, role: DemoRole = None):
    require_attribution(role, "household")
    audit = human_audit(db, case_id, role, "household")
    workspace.cancel_case(audit, body)
    return case_detail(db, audit.case)


@router.post("/cases/{case_id}/quote", response_model=out.CaseDetail)
def quote(case_id: str, body: s.QuoteCreate, db: Database, role: DemoRole = None):
    require_attribution(role, "provider")
    audit = human_audit(db, case_id, role, "provider")
    workspace.submit_quote(audit, body)
    return case_detail(db, audit.case)


@router.post("/cases/{case_id}/service-reports", response_model=out.CaseDetail, status_code=201)
def service_report(case_id: str, body: s.ServiceReportCreate, db: Database, role: DemoRole = None):
    require_attribution(role, "provider")
    audit = human_audit(db, case_id, role, "provider")
    workspace.submit_service_report(audit, body)
    return case_detail(db, audit.case)
