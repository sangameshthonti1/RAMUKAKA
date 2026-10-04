from fastapi import APIRouter
from sqlalchemy import or_, select

from app import models as m
from app.api.routes import Database, DemoRole
from app.api.workspace import require_attribution
from app.core.errors import WorkflowError
from app.schemas import api as out
from app.schemas import chat as s
from app.services import chat

router = APIRouter(prefix="/api", tags=["Service conversations"])


@router.get("/chat/conversations", response_model=list[s.ConversationSummary])
def customer_conversations(household_id: str, db: Database, role: DemoRole = None):
    require_attribution(role, "household")
    if db.get(m.Household, household_id) is None:
        raise WorkflowError(404, "Household not found")
    return list(
        db.scalars(
            select(m.ChatConversation)
            .where(m.ChatConversation.household_id == household_id)
            .order_by(m.ChatConversation.updated_at.desc())
        )
    )


@router.post("/chat/conversations", response_model=s.ConversationDetail, status_code=201)
def start(body: s.ConversationCreate, db: Database, role: DemoRole = None):
    require_attribution(role, "household")
    return chat.new_conversation(db, body.household_id)


@router.get("/chat/conversations/{conversation_id}", response_model=s.ConversationDetail)
def conversation(conversation_id: str, db: Database, role: DemoRole = None):
    require_attribution(role, "household")
    return chat.detail(db, chat.require_conversation(db, conversation_id))


@router.post("/chat/conversations/{conversation_id}/messages", response_model=s.ConversationDetail)
def customer_message(
    conversation_id: str, body: s.CustomerSend, db: Database, role: DemoRole = None
):
    require_attribution(role, "household")
    return chat.receive_customer(db, chat.require_conversation(db, conversation_id), body)


@router.get("/providers/{provider_id}/queue", response_model=list[out.CaseSummary])
def provider_queue(provider_id: str, db: Database, role: DemoRole = None):
    require_attribution(role, "provider")
    provider = db.get(m.Provider, provider_id)
    if provider is None:
        raise WorkflowError(404, "Provider not found")
    return list(
        db.scalars(
            select(m.ServiceCase)
            .where(
                or_(
                    m.ServiceCase.provider_id == provider.id,
                    (m.ServiceCase.provider_id.is_(None))
                    & (m.ServiceCase.service_category == provider.trade)
                    & (m.ServiceCase.status == "awaiting_quote"),
                )
            )
            .order_by(m.ServiceCase.created_at.desc(), m.ServiceCase.id.desc())
        )
    )


@router.get("/chat/cases/{case_id}/conversations", response_model=list[s.ConversationDetail])
def provider_conversations(case_id: str, provider_id: str, db: Database, role: DemoRole = None):
    require_attribution(role, "provider")
    case = db.get(m.ServiceCase, case_id)
    if case is None or case.provider_id != provider_id or not case.assigned:
        raise WorkflowError(
            403, "Only the currently assigned provider can view this case conversation"
        )
    return [
        chat.detail(db, record)
        for record in db.scalars(
            select(m.ChatConversation)
            .where(m.ChatConversation.case_id == case_id)
            .order_by(m.ChatConversation.created_at)
        )
    ]


@router.post(
    "/chat/conversations/{conversation_id}/provider-messages", response_model=s.ConversationDetail
)
def provider_message(
    conversation_id: str, body: s.ProviderSend, db: Database, role: DemoRole = None
):
    require_attribution(role, "provider")
    return chat.receive_provider(
        db, chat.require_conversation(db, conversation_id), body.provider_id, body.text
    )
