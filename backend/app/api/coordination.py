from fastapi import APIRouter

from app import models as m
from app.api.routes import Database, DemoRole
from app.api.workspace import require_attribution
from app.core.types import HUMAN, utcnow
from app.schemas import api as out
from app.schemas import coordination as s
from app.schemas.workspace import Location
from app.services import coordination as service
from app.services.queries import require_case
from app.services.workspace import get_record

router = APIRouter(prefix="/api", tags=["Local mock coordination"])


@router.patch("/households/{household_id}/location", response_model=out.Household)
def household_location(household_id: str, body: Location, db: Database, role: DemoRole = None):
    require_attribution(role, "household")
    household = get_record(db, m.Household, household_id)
    for key, value in body.model_dump().items():
        setattr(household, key, value)
    household.truth_label = HUMAN
    household.updated_at = utcnow()
    db.flush()
    return household


@router.patch("/providers/{provider_id}/location", response_model=out.Provider)
def provider_location(provider_id: str, body: Location, db: Database, role: DemoRole = None):
    require_attribution(role, "provider")
    provider = get_record(db, m.Provider, provider_id)
    provider.shop_address = body.address
    provider.latitude = body.latitude
    provider.longitude = body.longitude
    provider.truth_label = HUMAN
    provider.updated_at = utcnow()
    db.flush()
    return provider


@router.get("/cases/{case_id}/nearby-providers")
def nearby(case_id: str, db: Database):
    return {
        "source": "local_recorded_providers",
        "distance_method": "haversine_straight_line_recorded_coordinates",
        "unknown_distance_excluded": True,
        "providers": service.nearest(db, require_case(db, case_id)),
    }


@router.get("/cases/{case_id}/coordination", response_model=s.Coordination)
def get_coordination(case_id: str, db: Database):
    require_case(db, case_id)
    record = service.stored(db, case_id)
    if record is None:
        from app.core.errors import WorkflowError

        raise WorkflowError(404, "Coordination not started")
    return service.result(record)


@router.post("/cases/{case_id}/coordination/start", response_model=s.Coordination)
def start(case_id: str, body: s.Start, db: Database, role: DemoRole = None):
    require_attribution(role, "household")
    return service.start(db, require_case(db, case_id), body.expected_revision)


@router.post("/cases/{case_id}/coordination/consent", response_model=s.Coordination)
def consent(case_id: str, body: s.Consent, db: Database, role: DemoRole = None):
    require_attribution(role, "household")
    return service.consent(db, require_case(db, case_id), body)


@router.post("/cases/{case_id}/coordination/mock-provider-response", response_model=s.Coordination)
def provider_response(case_id: str, body: s.ProviderResponse, db: Database, role: DemoRole = None):
    require_attribution(role, "provider")
    return service.provider_response(db, require_case(db, case_id), body)
