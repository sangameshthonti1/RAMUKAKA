from datetime import datetime

import pytest
from conftest import act, approve, confirm, detail, progress


def test_approval_does_not_authorize_a_different_case(client):
    approve(client)
    other = client.post(
        "/api/cases", json={"asset_id": "asset-kent-purifier", "complaint": "Another issue"}
    ).json()
    assert act(client, "payment", case_id=other["id"]).status_code == 403
    assert act(client, "payment").status_code == 200
    assert detail(client, other["id"])["status"] == "awaiting_quote"


def test_new_share_request_cannot_reuse_old_consumed_authorization(client):
    request = {"kind": "share_sensitive", "reason": "Minimal local demo share"}
    assert client.post("/api/cases/RK-2048/approval-requests", json=request).status_code == 200
    approve(client, "share_sensitive")
    assert act(client, "share_sensitive").status_code == 200
    assert client.post("/api/cases/RK-2048/approval-requests", json=request).status_code == 200
    assert act(client, "share_sensitive").status_code == 403
    assert approve(client, "share_sensitive").status_code == 200
    assert act(client, "share_sensitive").status_code == 200


@pytest.mark.parametrize("kind", ["share_sensitive", "change_provider"])
def test_rejected_current_optional_scope_blocks_simulation(client, kind):
    request = {"kind": kind, "reason": "Review required"}
    if kind == "change_provider":
        request["target_provider_id"] = "provider-aqua-care"
    assert client.post("/api/cases/RK-2048/approval-requests", json=request).status_code == 200
    assert (
        client.post(
            "/api/cases/RK-2048/approvals", json={"kind": kind, "decision": "rejected"}
        ).status_code
        == 200
    )
    assert client.post("/api/simulation/next").status_code == 409
    assert client.get("/api/simulation").json()["step"] == 0


def test_other_party_confirmation_cannot_erase_unresolved_status(client):
    progress(client, 6)
    assert confirm(client, "provider", False).status_code == 200
    assert confirm(client, "household", True).json()["status"] == "reopened"
    assert detail(client)["provider_confirmed"] is False
    assert confirm(client, "provider", True).json()["status"] == "closed"


def test_exhausted_simulation_does_not_reclose_unresolved_case(client):
    progress(client, 6)
    confirm(client, "household", False)
    assert client.post("/api/simulation/next").json()["complete"] is True
    assert detail(client)["status"] == "reopened"


def test_manual_and_simulation_interleaving_keeps_updated_at_monotonic(client):
    assert approve(client).status_code == 200
    before = datetime.fromisoformat(detail(client)["updated_at"].replace("Z", "+00:00"))
    for _ in range(6):
        assert client.post("/api/simulation/next").status_code == 200
        after = datetime.fromisoformat(detail(client)["updated_at"].replace("Z", "+00:00"))
        assert after >= before
        before = after


def test_empty_note_is_rejected_without_affecting_state(client):
    before = detail(client)
    response = client.post(
        "/api/cases/RK-2048/events", json={"type": "customer_note", "detail": "   "}
    )
    assert response.status_code == 422
    assert detail(client) == before


def test_malformed_json_has_contract_error_shape_without_raw_input(client):
    response = client.post(
        "/api/signup",
        content='{"email":"secret@example.org",',
        headers={"Content-Type": "application/json"},
    )
    assert response.status_code == 422
    assert isinstance(response.json()["detail"], list)
    assert "secret@example.org" not in response.text


@pytest.mark.parametrize("error_type,status", [("integrity", 409), ("operational", 503)])
def test_commit_failure_is_json_error_before_response_and_rolls_back(
    client, monkeypatch, error_type, status
):
    from sqlalchemy.exc import IntegrityError, OperationalError
    from sqlalchemy.orm import Session

    before = detail(client)
    error = IntegrityError if error_type == "integrity" else OperationalError

    def fail_commit(self):
        raise error("private SQL", {"secret": "do-not-leak"}, RuntimeError("injected failure"))

    with monkeypatch.context() as patch:
        patch.setattr(Session, "commit", fail_commit)
        response = client.post(
            "/api/cases/RK-2048/events", json={"type": "customer_note", "detail": "Must roll back"}
        )
    assert response.status_code == status
    assert isinstance(response.json()["detail"], str)
    assert "do-not-leak" not in response.text
    assert detail(client) == before
