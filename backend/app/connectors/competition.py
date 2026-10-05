import hashlib
import json
from typing import Any
from urllib.parse import urlparse

import httpx
from fastapi import UploadFile
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.core.errors import WorkflowError
from app.core.types import SIMULATED, TruthLabel
from app.models import ConnectorCall, ServiceCase
from app.schemas.api import DocumentedRailResponse
from app.services.approvals import approved_spend

GNANI_DOCS = "https://www.gnani.ai/speech-to-text-api"
PINE_DOCS = "https://www.pinelabs.com/docs/online-payments/api/payment-links/create-payment-link"
DELHIVERY_DOCS = "https://help.delhivery.com/docs/client-developer-portal-1"
MAX_AUDIO_BYTES = 10 * 1024 * 1024


def contracts(settings: Settings) -> list[dict[str, Any]]:
    has_gnani_key = bool(settings.gnani_api_key.get_secret_value())
    return [
        {
            "connector": "Gnani",
            "operation": "transcribe_audio",
            "method": "POST",
            "endpoint": settings.gnani_stt_url,
            "execution": "live_api",
            "truth_label": TruthLabel.LIVE_API.value,
            "documentation_url": GNANI_DOCS,
            "ready": settings.gnani_live_enabled and has_gnani_key,
            "blocker": None
            if settings.gnani_live_enabled and has_gnani_key
            else "Set GNANI_LIVE_ENABLED=true and provide GNANI_API_KEY locally.",
        },
        {
            "connector": "Pine Labs",
            "operation": "create_payment_link",
            "method": "POST",
            "endpoint": "https://pluraluat.v2.pinepg.in/api/pay/v1/paymentlink",
            "execution": "documentation_simulation",
            "truth_label": SIMULATED,
            "documentation_url": PINE_DOCS,
            "ready": True,
            "blocker": None,
        },
        {
            "connector": "Delhivery",
            "operation": "create_part_shipment / track_part_shipment",
            "method": "As documented",
            "endpoint": "Paste the exact Delhivery One developer-portal endpoint",
            "execution": "wizard_documentation_input",
            "truth_label": SIMULATED,
            "documentation_url": DELHIVERY_DOCS,
            "ready": False,
            "blocker": (
                "Exact API URL and sample response require the competition/Delhivery One "
                "documentation."
            ),
        },
    ]


def _case(session: Session, case_id: str) -> ServiceCase:
    case = session.get(ServiceCase, case_id)
    if case is None:
        raise WorkflowError(404, "Case not found")
    return case


def _record(
    session: Session,
    case_id: str,
    connector: str,
    operation: str,
    request: dict[str, Any],
    response: dict[str, Any],
    truth_label: str,
    status: str,
) -> ConnectorCall:
    call = ConnectorCall(
        case_id=case_id,
        connector=connector,
        operation=operation,
        request=request,
        response=response,
        truth_label=truth_label,
        status=status,
    )
    session.add(call)
    session.flush()
    return call


def _official_partner_url(connector: str, endpoint: str, documentation_url: str) -> None:
    endpoint_parts = urlparse(endpoint)
    docs_parts = urlparse(documentation_url)
    if endpoint_parts.scheme != "https" or docs_parts.scheme != "https":
        raise WorkflowError(422, "Partner endpoint and documentation URL must use HTTPS")
    if connector == "Pine Labs":
        if (
            endpoint_parts.hostname != "pluraluat.v2.pinepg.in"
            or endpoint_parts.path != "/api/pay/v1/paymentlink"
            or docs_parts.hostname not in {"www.pinelabs.com", "developer.pinelabsonline.com"}
        ):
            raise WorkflowError(422, "Use the reviewed Pine Labs UAT payment-link contract")
    elif not (
        endpoint_parts.hostname
        and (
            endpoint_parts.hostname == "delhivery.com"
            or endpoint_parts.hostname.endswith(".delhivery.com")
        )
        and docs_parts.hostname
        and (
            docs_parts.hostname == "delhivery.com"
            or docs_parts.hostname.endswith(".delhivery.com")
        )
        and endpoint_parts.path not in {"", "/"}
    ):
        raise WorkflowError(
            422, "Use an exact endpoint and source from official Delhivery documentation"
        )


def record_documented_response(
    session: Session, case_id: str, body: DocumentedRailResponse
) -> ConnectorCall:
    case = _case(session, case_id)
    approval = approved_spend(session, case)
    if approval is None:
        raise WorkflowError(
            403,
            "A matching approved service quote is required before payment or part logistics",
            case_id=case.id,
            action=body.operation,
            rule="APPROVAL_REQUIRED",
            truth_label=SIMULATED,
        )
    _official_partner_url(body.connector, body.endpoint, body.documentation_url)
    encoded = json.dumps({"request": body.request, "response": body.response})
    if len(encoded.encode()) > 100_000:
        raise WorkflowError(413, "Documented request and response must remain under 100 KB")
    if body.connector == "Pine Labs":
        amount = body.request.get("amount")
        value = amount.get("value") if isinstance(amount, dict) else None
        if value not in {approval.amount, approval.amount * 100}:
            raise WorkflowError(422, "Pine Labs request amount does not match the approved quote")
    return _record(
        session,
        case.id,
        body.connector,
        body.operation,
        {
            "endpoint": body.endpoint,
            "documentation_url": body.documentation_url,
            "approved_amount_inr": approval.amount,
            "payload": body.request,
        },
        body.response,
        SIMULATED,
        "documentation_response_recorded",
    )


async def transcribe_gnani(
    session: Session,
    settings: Settings,
    case_id: str,
    audio: UploadFile,
    language_code: str,
) -> ConnectorCall:
    case = _case(session, case_id)
    api_key = settings.gnani_api_key.get_secret_value()
    if not settings.gnani_live_enabled or not api_key:
        raise WorkflowError(
            503,
            "Gnani live STT is disabled or GNANI_API_KEY is missing",
            case_id=case.id,
            action="gnani_transcription",
            rule="VERIFIED_LIVE_CONFIGURATION_REQUIRED",
            truth_label=SIMULATED,
        )
    if language_code not in {"hi-IN", "en-IN", "kn-IN", "ta-IN", "te-IN", "mr-IN"}:
        raise WorkflowError(422, "Unsupported demonstration language code")
    data = await audio.read(MAX_AUDIO_BYTES + 1)
    if not data or len(data) > MAX_AUDIO_BYTES:
        raise WorkflowError(413, "Audio must be non-empty and at most 10 MB")
    filename = (audio.filename or "recording.wav").rsplit("/", 1)[-1].rsplit("\\", 1)[-1][:120]
    request_log = {
        "endpoint": settings.gnani_stt_url,
        "filename": filename,
        "content_type": audio.content_type or "application/octet-stream",
        "size_bytes": len(data),
        "sha256": hashlib.sha256(data).hexdigest(),
        "form": {
            "language_code": language_code,
            "preferred_language": language_code,
            "format": "transcribe",
            "itn_native_numerals": "true",
        },
    }
    try:
        async with httpx.AsyncClient(timeout=settings.gnani_timeout_seconds) as client:
            response = await client.post(
                settings.gnani_stt_url,
                headers={"X-API-Key-ID": api_key},
                data=request_log["form"],
                files={"audio_file": (filename, data, audio.content_type)},
            )
        raw = response.text
        try:
            parsed: Any = response.json()
        except ValueError:
            parsed = None
        response_log = {
            "http_status": response.status_code,
            "raw_response": raw,
            "parsed_response": parsed,
        }
        status = "live_succeeded" if response.is_success else "live_failed"
    except httpx.HTTPError as exc:
        response_log = {"network_error": type(exc).__name__}
        status = "live_failed"
    return _record(
        session,
        case.id,
        "Gnani",
        "transcribe_audio",
        request_log,
        response_log,
        TruthLabel.LIVE_API.value,
        status,
    )
