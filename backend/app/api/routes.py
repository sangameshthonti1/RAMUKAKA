from typing import Annotated

from fastapi import APIRouter, Depends, Header, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import models as m
from app.agent.prompt import SYSTEM_PROMPT
from app.connectors.mock import ConnectorRegistry
from app.core.errors import WorkflowError
from app.core.types import HUMAN
from app.database.session import get_session
from app.schemas import api as s
from app.services import approvals, lifecycle, simulation
from app.services.audit import Audit
from app.services.intake import create_case
from app.services.queries import case_detail, records, require_case

router = APIRouter(prefix="/api")
# Commit or roll back before sending the response, including commit-time errors.
Database = Annotated[Session, Depends(get_session, scope="function")]
DemoRole = Annotated[str | None, Header(alias="X-Demo-Role")]


def human_audit(
    session: Session, case_id: str, role: str | None, expected: str | None = None
) -> Audit:
    case = require_case(session, case_id)
    audit = Audit(session, case, HUMAN)
    # Optional demo UX attribution only. Omitting/spoofing this header is possible;
    # no caller should mistake this local convenience for authentication.
    if role is not None and (
        role not in {"household", "provider"} or (expected and role != expected)
    ):
        approvals.deny(
            audit,
            403,
            "Demo role is not allowed for this operation",
            "demo_role",
            "DEMO_ROLE_ATTRIBUTION",
        )
    return audit


@router.get("/households", response_model=list[s.Household])
def households(db: Database):
    return records(db, m.Household)


@router.get("/assets", response_model=list[s.Asset])
def assets(db: Database):
    return records(db, m.Asset)


@router.get("/assets/{asset_id}", response_model=s.AssetDetail)
def asset_detail(asset_id: str, db: Database):
    asset = db.get(m.Asset, asset_id)
    if asset is None:
        raise WorkflowError(404, "Asset not found")
    cases = list(
        db.scalars(
            select(m.ServiceCase)
            .where(m.ServiceCase.asset_id == asset_id)
            .order_by(m.ServiceCase.created_at, m.ServiceCase.id)
        )
    )
    return {"asset": asset, "cases": cases}


@router.get("/cases", response_model=list[s.CaseSummary])
def cases(db: Database):
    return records(db, m.ServiceCase)


@router.post("/cases", response_model=s.CaseDetail, status_code=201)
def new_case(body: s.CaseCreate, db: Database):
    return case_detail(db, create_case(db, body.asset_id, body.complaint))


@router.get("/cases/{case_id}", response_model=s.CaseDetail)
def get_case(case_id: str, db: Database):
    return case_detail(db, require_case(db, case_id))


@router.post("/cases/{case_id}/events", response_model=s.CaseDetail)
def event(case_id: str, body: s.EventCreate, db: Database, role: DemoRole = None):
    audit = human_audit(db, case_id, role, "household")
    lifecycle.customer_event(audit, body.type, body.detail)
    return case_detail(db, audit.case)


@router.post("/cases/{case_id}/approvals", response_model=s.CaseDetail)
def resolve_approval(case_id: str, body: s.ApprovalResolve, db: Database, role: DemoRole = None):
    audit = human_audit(db, case_id, role, "household")
    approvals.resolve(audit, body.kind, body.decision)
    return case_detail(db, audit.case)


@router.post("/cases/{case_id}/approval-requests", response_model=s.CaseDetail)
def request_approval(case_id: str, body: s.ApprovalRequest, db: Database, role: DemoRole = None):
    audit = human_audit(db, case_id, role, "household")
    approvals.request_approval(audit, body.kind, body.reason, body.target_provider_id)
    return case_detail(db, audit.case)


@router.post("/cases/{case_id}/actions", response_model=s.CaseDetail)
def action(case_id: str, body: s.ActionRequest, db: Database, role: DemoRole = None):
    audit = human_audit(db, case_id, role, "household")
    approvals.perform(audit, body.action)
    return case_detail(db, audit.case)


@router.post("/cases/{case_id}/provider-confirmation", response_model=s.CaseDetail)
def provider_confirmation(case_id: str, body: s.Confirmation, db: Database, role: DemoRole = None):
    audit = human_audit(db, case_id, role, "provider")
    lifecycle.confirm(audit, "provider", body.confirmed, body.note)
    return case_detail(db, audit.case)


@router.post("/cases/{case_id}/household-confirmation", response_model=s.CaseDetail)
def household_confirmation(case_id: str, body: s.Confirmation, db: Database, role: DemoRole = None):
    audit = human_audit(db, case_id, role, "household")
    lifecycle.confirm(audit, "household", body.confirmed, body.note)
    return case_detail(db, audit.case)


@router.get("/decisions", response_model=list[s.Decision])
def decisions(db: Database):
    return records(db, m.Decision)


@router.get("/evidence", response_model=list[s.Evidence])
def evidence(db: Database):
    return records(db, m.Evidence)


@router.get("/connectors", response_model=list[s.ConnectorCall])
def connectors(db: Database):
    return records(db, m.ConnectorCall)


@router.get("/providers", response_model=list[s.Provider])
def providers(db: Database):
    return records(db, m.Provider)


@router.get("/notifications", response_model=list[s.Notification])
def notifications(db: Database):
    return records(db, m.Notification)


@router.get("/rails", response_model=list[s.Rail])
def rails(request: Request):
    return ConnectorRegistry(request.app.state.settings.connector_mode).rails()


@router.get("/system-prompt", response_model=s.SystemPrompt)
def system_prompt():
    return {"prompt": SYSTEM_PROMPT}


@router.post("/signup", response_model=s.SignupResult, status_code=201)
def signup(body: s.SignupCreate, db: Database):
    if db.scalar(select(m.Signup.id).where(m.Signup.email == body.email)):
        raise WorkflowError(409, "This email is already registered locally")
    record = m.Signup(name=body.name, email=body.email, consent=True)
    db.add(record)
    db.flush()
    return {"id": record.id, "message": "Saved locally with consent. No message or email was sent."}


@router.get("/simulation", response_model=s.SimulationState)
def simulation_state(db: Database):
    return simulation.state(db)


@router.post("/simulation/next", response_model=s.SimulationState)
def simulation_next(db: Database):
    return simulation.advance(db)


@router.post("/simulation/reset", response_model=s.SimulationState)
def simulation_reset(db: Database):
    return simulation.reset(db)
