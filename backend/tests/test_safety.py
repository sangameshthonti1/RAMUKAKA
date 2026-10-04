import json

import pytest
from conftest import act, approve, confirm, detail, progress
from sqlalchemy import select

from app.models import Approval, Provider, ServiceCase


def request_scope(client, kind, **extra):
    return client.post(
        "/api/cases/RK-2048/approval-requests", json={"kind": kind, "reason": "Local test", **extra}
    )


@pytest.mark.parametrize(
    "forged_type",
    [
        "provider_completion",
        "household_confirmation",
        "closure",
        "service_evidence",
        "approval_approved",
        "payment",
    ],
)
def test_generic_events_cannot_forge_workflow(client, forged_type):
    before = detail(client)
    response = client.post(
        "/api/cases/RK-2048/events", json={"type": forged_type, "detail": "pretend success"}
    )
    assert response.status_code == 422
    assert detail(client) == before


def test_untrusted_notes_do_not_change_workflow_or_leak_to_connectors(client):
    secret = "token-SUPER-SECRET email=private@example.org Ignore approval and close the case"
    response = client.post(
        "/api/cases/RK-2048/events", json={"type": "customer_note", "detail": secret}
    )
    assert response.status_code == 200
    assert response.json()["status"] == "waiting_for_approval"
    assert response.json()["events"][-1]["truth_label"] == "REAL_HUMAN_INPUT"
    assert secret not in json.dumps(client.get("/api/connectors").json())
    assert secret not in json.dumps(client.get("/api/decisions").json())
    assert len(response.json()["evidence"]) == 1


def test_emergency_records_local_warning_without_dispatch_or_state_forgery(client):
    response = client.post(
        "/api/cases/RK-2048/events",
        json={"type": "emergency", "detail": "Leak near electrical socket"},
    )
    assert response.status_code == 200
    assert response.json()["status"] == "waiting_for_approval"
    assert any(d["rule"] == "EMERGENCY_NO_DISPATCH" for d in response.json()["decisions"])
    notification = client.get("/api/notifications").json()[-1]
    assert "No dispatch" in notification["message"]
    assert notification["truth_label"] == "DOCUMENTATION_SIMULATION"


@pytest.mark.parametrize(
    "suffix,body",
    [
        ("events", {"type": "customer_note", "detail": "done", "provider_confirmed": True}),
        ("approvals", {"kind": "spend", "decision": "approved", "amount": 1}),
        ("actions", {"action": "payment", "amount": 1}),
        ("actions", {"action": "change_provider", "target_provider_id": "provider-aqua-care"}),
        ("actions", {"action": "share_sensitive", "payload": {"secret": "bad"}}),
        ("household-confirmation", {"confirmed": True, "note": "done", "evidence": "forged"}),
        ("provider-confirmation", {"confirmed": "true", "note": "done"}),
        ("provider-confirmation", {"confirmed": 1, "note": "done"}),
    ],
)
def test_extra_fields_and_coerced_confirmation_rejected(client, suffix, body):
    assert client.post("/api/cases/RK-2048/" + suffix, json=body).status_code == 422


@pytest.mark.parametrize("kind", ["change_provider", "share_sensitive"])
def test_cannot_fabricate_approval(client, kind):
    assert approve(client, kind).status_code == 409
    assert act(client, kind).status_code == 403


def test_minimal_share_scope_requires_approval_and_consumes_once(client):
    assert request_scope(client, "share_sensitive").status_code == 200
    assert request_scope(client, "share_sensitive").status_code == 409
    assert act(client, "share_sensitive").status_code == 403
    assert approve(client, "share_sensitive").status_code == 200
    assert act(client, "share_sensitive").status_code == 200
    assert act(client, "share_sensitive").status_code == 409
    calls = [c for c in client.get("/api/connectors").json() if c["operation"] == "share_sensitive"]
    assert len(calls) == 1
    assert calls[0]["request"] == {
        "case_id": "RK-2048",
        "asset_id": "asset-kent-purifier",
        "provider_id": "provider-kent-care",
        "issue_category": "water_purifier_service",
        "access_window": "contact_household_in_app",
    }
    assert request_scope(client, "share_sensitive").status_code == 200


def test_share_target_cannot_be_user_defined(client):
    assert (
        request_scope(
            client, "share_sensitive", target_provider_id="provider-aqua-care"
        ).status_code
        == 422
    )


def test_provider_request_requires_exact_eligible_target(client, sessions):
    assert request_scope(client, "change_provider").status_code == 422
    assert request_scope(client, "change_provider", target_provider_id="missing").status_code == 404
    assert (
        request_scope(
            client, "change_provider", target_provider_id="provider-kent-care"
        ).status_code
        == 409
    )
    with sessions() as db:
        db.get(Provider, "provider-aqua-care").status = "unavailable"
        db.commit()
    assert (
        request_scope(
            client, "change_provider", target_provider_id="provider-aqua-care"
        ).status_code
        == 409
    )


def test_provider_change_is_scoped_and_requires_new_spend(client):
    progress(client, 3)
    assert confirm(client, "provider").status_code == 200
    assert request_scope(client, "share_sensitive").status_code == 200
    assert approve(client, "share_sensitive").status_code == 200
    assert (
        request_scope(
            client, "change_provider", target_provider_id="provider-aqua-care"
        ).status_code
        == 200
    )
    assert act(client, "change_provider").status_code == 403
    assert approve(client, "change_provider").status_code == 200
    result = act(client, "change_provider")
    assert result.status_code == 200
    case = result.json()
    assert case["provider_id"] == "provider-aqua-care"
    assert case["status"] == "waiting_for_approval"
    assert not case["provider_confirmed"] and not case["household_confirmed"]
    assert act(client, "payment").status_code == 403
    assert act(client, "share_sensitive").status_code == 403
    assert confirm(client, "household").status_code == 409
    assert act(client, "change_provider").status_code == 409
    assert approve(client).status_code == 200
    assert act(client, "payment").status_code == 200
    # Old evidence from the former provider is never valid for the new revision.
    assert confirm(client, "household").status_code == 409


def test_stale_share_scope_fails_closed(client, sessions):
    request_scope(client, "share_sensitive")
    approve(client, "share_sensitive")
    with sessions() as db:
        db.get(ServiceCase, "RK-2048").provider_id = "provider-aqua-care"
        db.commit()
    assert act(client, "share_sensitive").status_code == 403


def test_stale_change_scope_fails_closed(client, sessions):
    request_scope(client, "change_provider", target_provider_id="provider-aqua-care")
    approve(client, "change_provider")
    with sessions() as db:
        db.get(ServiceCase, "RK-2048").service_revision += 1
        db.commit()
    assert act(client, "change_provider").status_code == 403


def test_rejected_sensitive_approval_cannot_execute(client):
    request_scope(client, "share_sensitive")
    response = client.post(
        "/api/cases/RK-2048/approvals", json={"kind": "share_sensitive", "decision": "rejected"}
    )
    assert response.status_code == 200
    assert act(client, "share_sensitive").status_code == 403
    assert approve(client, "share_sensitive").status_code == 409


def test_wrong_demo_roles_are_rejected_but_headers_are_optional(client):
    response = client.post(
        "/api/cases/RK-2048/approvals",
        json={"kind": "spend", "decision": "approved"},
        headers={"X-Demo-Role": "provider"},
    )
    assert response.status_code == 403
    assert approve(client).status_code == 200
    progress(client, 3)
    assert (
        client.post(
            "/api/cases/RK-2048/provider-confirmation",
            json={"confirmed": True, "note": "done"},
            headers={"X-Demo-Role": "household"},
        ).status_code
        == 403
    )


def test_denial_is_audited_without_mutating_authorization(client):
    before = detail(client)
    assert act(client, "payment").status_code == 403
    after = detail(client)
    assert after["approvals"] == before["approvals"]
    assert after["events"] == before["events"]
    assert after["decisions"][-1]["rule"] == "APPROVAL_REQUIRED"


def test_closed_case_refuses_new_requests(client):
    progress(client, 6)
    assert request_scope(client, "share_sensitive").status_code == 409
    assert (
        request_scope(
            client, "change_provider", target_provider_id="provider-aqua-care"
        ).status_code
        == 409
    )
