from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, Request, UploadFile
from sqlalchemy.orm import Session

from app.connectors.competition import contracts, record_documented_response, transcribe_gnani
from app.database.session import get_session
from app.schemas import api as s

router = APIRouter(prefix="/api/partner-rails", tags=["competition partner rails"])
Database = Annotated[Session, Depends(get_session, scope="function")]


@router.get("/contracts", response_model=list[s.PartnerRailContract])
def rail_contracts(request: Request):
    return contracts(request.app.state.settings)


@router.post("/{case_id}/documented-response", response_model=s.ConnectorCall, status_code=201)
def documented_response(case_id: str, body: s.DocumentedRailResponse, db: Database):
    return record_documented_response(db, case_id, body)


@router.post("/{case_id}/gnani/transcribe", response_model=s.ConnectorCall, status_code=201)
async def gnani_transcription(
    case_id: str,
    request: Request,
    db: Database,
    audio: Annotated[UploadFile, File()],
    language_code: Annotated[str, Form()] = "hi-IN",
):
    return await transcribe_gnani(db, request.app.state.settings, case_id, audio, language_code)
