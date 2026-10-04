from typing import Annotated

from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.agent.gemini import contract, decide
from app.database.session import get_session
from app.schemas import api as s

router = APIRouter(prefix="/api/agent", tags=["live agent"])
Database = Annotated[Session, Depends(get_session, scope="function")]


@router.get("/contract", response_model=s.AgentContract)
def agent_contract(request: Request):
    return contract(request.app.state.settings)


@router.post("/{case_id}/decide", response_model=s.AgentRun, status_code=201)
async def agent_decision(case_id: str, request: Request, db: Database):
    return await decide(db, request.app.state.settings, case_id)
