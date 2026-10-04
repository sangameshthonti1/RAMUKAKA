"""Deterministic, stateful service conversation; no external model or fabricated answers."""

import re

from sqlalchemy import select
from sqlalchemy.orm import Session

from app import models as m
from app.core.errors import WorkflowError
from app.core.types import HUMAN, SIMULATED, utcnow
from app.schemas import chat as s
from app.services.intake import create_case

EMERGENCY = re.compile(r"\b(fire|smoke|gas leak|electric shock|electrocution|sparks)\b", re.I)
REPAIR = re.compile(
    r"\b(repair|fix|broken|not working|leak|service|issue|problem|stopped|replace|fault)\b", re.I
)
STATUS = re.compile(r"\b(status|progress|update|track|case)\b", re.I)
ASSETS = re.compile(r"\b(assets|appliances|inventory|my home|machines)\b", re.I)
HISTORY = re.compile(
    r"\b(warrant\w*|amc|service history|installation|last service|service date)\b", re.I
)


def require_conversation(db: Session, conversation_id: str) -> m.ChatConversation:
    conversation = db.get(m.ChatConversation, conversation_id)
    if conversation is None:
        raise WorkflowError(404, "Conversation not found")
    return conversation


def detail(db: Session, conversation: m.ChatConversation) -> s.ConversationDetail:
    db.flush()
    return s.ConversationDetail(
        **s.ConversationSummary.model_validate(conversation).model_dump(),
        messages=list(
            db.scalars(
                select(m.ChatMessage)
                .where(m.ChatMessage.conversation_id == conversation.id)
                .order_by(m.ChatMessage.created_at, m.ChatMessage.id)
            )
        ),
    )


def add_message(db: Session, conversation: m.ChatConversation, role: str, text: str):
    db.add(
        m.ChatMessage(
            conversation_id=conversation.id,
            role=role,
            content=text,
            truth_label=SIMULATED if role == "assistant" else HUMAN,
        )
    )
    conversation.updated_at = utcnow()
    db.flush()


def new_conversation(db: Session, household_id: str):
    if db.get(m.Household, household_id) is None:
        raise WorkflowError(404, "Household not found")
    conversation = m.ChatConversation(household_id=household_id, stage="ready", status="open")
    db.add(conversation)
    db.flush()
    add_message(
        db,
        conversation,
        "assistant",
        "Hello! I can help you record an appliance problem, find a case update, or review what is actually stored about a service. I am a local rules-based assistant, not a live technician or AI model. What would you like to do?",
    )
    return detail(db, conversation)


def household_assets(db: Session, household_id: str):
    return list(
        db.scalars(
            select(m.Asset)
            .where(m.Asset.household_id == household_id)
            .order_by(m.Asset.created_at, m.Asset.id)
        )
    )


def case_status(db: Session, conversation: m.ChatConversation, text: str) -> str:
    mention = re.search(r"\bRK-[A-Za-z0-9_-]+\b", text, re.I)
    case = db.get(m.ServiceCase, mention.group(0)) if mention else None
    if mention and (case is None or case.household_id != conversation.household_id):
        return "I couldn't find that case for this household. Check the case ID in My cases."
    if case is None and conversation.case_id:
        case = db.get(m.ServiceCase, conversation.case_id)
    if case is None:
        case = db.scalar(
            select(m.ServiceCase)
            .where(m.ServiceCase.household_id == conversation.household_id)
            .order_by(m.ServiceCase.created_at.desc(), m.ServiceCase.id.desc())
            .limit(1)
        )
    if case is None:
        return "No service case is recorded for this household yet. Tell me what needs repair and choose the appliance; I'll ask before creating a case."
    conversation.case_id = case.id
    progress = {
        "awaiting_quote": "Waiting for a provider to enter a real local quote. No price or visit is confirmed.",
        "waiting_for_approval": "A recorded quote is waiting for household approval. Nothing has been charged.",
        "approved": "Household approval is recorded, but assignment still requires the separate mock action.",
        "assigned": "Assigned in the local mock workflow; this is not a verified booking. Waiting for the provider's service report.",
        "awaiting_confirmation": "A service report is on record. Both provider and household still need to confirm the result.",
        "closed": "The recorded workflow was closed after provider and household confirmations. Read the truth labels before treating the report as verified physical work.",
        "reopened": "Someone reported the issue as unresolved. The case remains open for follow-up.",
        "approval_rejected": "The proposed service was rejected. No payment or assignment was made.",
        "cancelled": "This unassigned request was cancelled without claiming the work was completed.",
    }
    amount = (
        f" Recorded quote: ₹{case.quote_amount}."
        if case.quote_amount is not None
        else " No quote has been recorded."
    )
    return f"{case.id} — {case.title}. {progress.get(case.status, 'See the case timeline for the current state.')}{amount} Open My cases for the labeled timeline and any approvals."


def receive_customer(db: Session, conversation: m.ChatConversation, body: s.CustomerSend):
    text = body.text.strip()
    add_message(db, conversation, "customer", text)
    assets = household_assets(db, conversation.household_id)
    if body.action == "cancel_report":
        conversation.stage = "ready"
        conversation.asset_id = None
        conversation.draft_complaint = None
        response = "I discarded the draft. No new repair case was created."
    elif body.action == "confirm_report":
        asset = db.get(m.Asset, conversation.asset_id) if conversation.asset_id else None
        if (
            conversation.stage != "confirm_report"
            or not conversation.draft_complaint
            or asset is None
            or asset.household_id != conversation.household_id
            or asset.status != "active"
        ):
            raise WorkflowError(
                409,
                "Choose an active household asset and describe the problem before confirming a report",
            )
        case = create_case(db, asset.id, conversation.draft_complaint)
        conversation.case_id = case.id
        conversation.stage = "ready"
        conversation.draft_complaint = None
        response = f"I saved case {case.id} for {asset.name}. Its complaint is on record, but there is no provider quote, booking or charge yet. You can track it in My cases."
    elif EMERGENCY.search(text):
        conversation.stage = "ready"
        conversation.draft_complaint = None
        response = "This may be urgent. I cannot dispatch emergency help, shut off equipment or assess safety. Leave the area if necessary and contact local emergency services or qualified assistance directly. No repair request was created by this message."
    elif body.asset_id:
        asset = db.get(m.Asset, body.asset_id)
        if (
            asset is None
            or asset.household_id != conversation.household_id
            or asset.status != "active"
        ):
            raise WorkflowError(404, "Active appliance not found in this household")
        conversation.asset_id = asset.id
        conversation.draft_complaint = None
        conversation.stage = "await_problem"
        response = f"I found {asset.name} in your household record. What is wrong with it? Include the symptoms in your own words. I won't contact or charge anyone."
    elif conversation.stage == "await_problem":
        if len(text) < 10:
            response = (
                "Please describe the issue in at least ten characters. What have you observed?"
            )
        else:
            conversation.draft_complaint = text
            conversation.stage = "confirm_report"
            asset = db.get(m.Asset, conversation.asset_id)
            response = f"Please check before I save this: {asset.name if asset else 'your appliance'} — '{text}'. Choose Confirm repair request to create a case, or Cancel draft. No provider or price is assumed."
    elif conversation.stage == "confirm_report":
        response = "Your description is still a draft. Use the explicit Confirm repair request button to create a case, or Cancel draft. I will not treat a free-text reply as permission."
    elif HISTORY.search(text):
        if not assets:
            response = "No appliances are recorded for this household. Add an appliance in My Home first; I won't invent warranty or service dates."
        else:
            details = []
            for asset in assets:
                warranty = str(asset.warranty_until) if asset.warranty_until else "not recorded"
                service = str(asset.next_service_on) if asset.next_service_on else "not recorded"
                details.append(
                    f"{asset.name}: installed {asset.installed_on}; warranty expiry {warranty}; next service date {service}"
                )
            response = (
                "Household-entered dates (not manufacturer-verified): "
                + "; ".join(details)
                + ". AMC coverage is not recorded. Open My Home for case history and to update these dates."
            )
    elif STATUS.search(text):
        response = case_status(db, conversation, text)
    elif ASSETS.search(text):
        response = (
            "On record: "
            + (
                "; ".join(
                    f"{asset.name} ({asset.location}, {asset.category.replace('_', ' ')})"
                    for asset in assets
                )
                if assets
                else "no appliances yet"
            )
            + ". Select an appliance here to start a repair, or add one in My Home."
        )
    elif REPAIR.search(text):
        if not any(asset.status == "active" for asset in assets):
            response = "First add your appliance in My Home. It must be on record before I can attach a repair request. No request was created."
        else:
            conversation.stage = "await_asset"
            response = "I can record that issue. Choose the affected appliance below, then describe the problem. I will show you a draft for explicit confirmation."
    else:
        response = "I can help with a repair request, current case status, recorded appliances, or known service history. Try one of the suggested actions. I cannot check live technicians, warranty providers or payments."
    add_message(db, conversation, "assistant", response)
    return detail(db, conversation)


def receive_provider(db: Session, conversation: m.ChatConversation, provider_id: str, text: str):
    case = db.get(m.ServiceCase, conversation.case_id) if conversation.case_id else None
    provider = db.get(m.Provider, provider_id)
    if (
        case is None
        or provider is None
        or provider.id != case.provider_id
        or not case.assigned
        or case.status in {"closed", "cancelled"}
    ):
        raise WorkflowError(
            403, "Only the currently assigned provider may post a local case update"
        )
    add_message(db, conversation, "provider", text.strip())
    return detail(db, conversation)
