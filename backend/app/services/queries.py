from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import WorkflowError
from app.models import Approval, CaseEvent, Decision, Evidence, ServiceCase
from app.schemas.api import CaseDetail, CaseSummary


def require_case(session: Session, case_id: str) -> ServiceCase:
    case = session.get(ServiceCase, case_id)
    if case is None:
        raise WorkflowError(404, "Case not found")
    return case


def records(session: Session, model, case_id: str | None = None):
    query = select(model)
    if case_id is not None:
        query = query.where(model.case_id == case_id)
    return list(session.scalars(query.order_by(model.created_at, model.id)))


def case_detail(session: Session, case: ServiceCase) -> CaseDetail:
    session.flush()
    return CaseDetail(**CaseSummary.model_validate(case).model_dump(),
                      events=records(session, CaseEvent, case.id),
                      approvals=records(session, Approval, case.id),
                      evidence=records(session, Evidence, case.id),
                      decisions=records(session, Decision, case.id))
