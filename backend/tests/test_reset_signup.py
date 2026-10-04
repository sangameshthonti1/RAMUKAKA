import json

import pytest
from conftest import act, approve, detail, progress
from sqlalchemy import func, select

from app.models import Signup
from app.seed.demo import seed_demo

SIGNUP = {"name": "Local Tester", "email": "tester@example.org", "consent": True}


def snapshot(client):
    return {
        endpoint: client.get("/api/" + endpoint).json()
        for endpoint in [
            "cases/RK-2048",
            "simulation",
            "connectors",
            "evidence",
            "decisions",
            "notifications",
        ]
    }


def test_signup_is_local_and_does_not_send_anything(client, sessions):
    before = client.get("/api/connectors").json()
    response = client.post("/api/signup", json=SIGNUP)
    assert response.status_code == 201
    assert set(response.json()) == {"id", "message"}
    assert "locally" in response.json()["message"]
    assert client.get("/api/connectors").json() == before
    with sessions() as db:
        signup = db.get(Signup, response.json()["id"])
        assert signup.email == "tester@example.org" and signup.consent is True


def test_duplicate_signup_is_case_insensitive(client):
    assert client.post("/api/signup", json=SIGNUP).status_code == 201
    assert (
        client.post("/api/signup", json={**SIGNUP, "email": "TESTER@EXAMPLE.ORG"}).status_code
        == 409
    )


@pytest.mark.parametrize(
    "change",
    [
        {"consent": False},
        {"consent": "true"},
        {"consent": 1},
        {"name": " "},
        {"email": "invalid"},
        {"email": "a@b"},
        {"email": "a..b@example.org"},
        {"email": "x@-bad.example.org"},
        {"email": "x@example.org\nsecret"},
        {"extra": "secret-token"},
    ],
)
def test_signup_validation(client, change):
    response = client.post("/api/signup", json={**SIGNUP, **change})
    assert response.status_code == 422
    assert isinstance(response.json()["detail"], list)
    assert "secret-token" not in response.text
    assert "tester@example.org" not in response.text


def test_reset_is_deterministic_including_record_ids_and_times(client):
    initial = snapshot(client)
    progress(client, 6)
    final = snapshot(client)
    assert client.post("/api/simulation/reset").status_code == 200
    assert snapshot(client) == initial
    progress(client, 6)
    assert snapshot(client) == final
    assert client.post("/api/simulation/reset").status_code == 200
    assert snapshot(client) == initial


def test_reset_keeps_signups_and_unrelated_cases_even_on_demo_asset(client, sessions):
    signup_id = client.post("/api/signup", json=SIGNUP).json()["id"]
    result = client.post(
        "/api/cases",
        json={"asset_id": "asset-kent-purifier", "complaint": "Unrelated household issue"},
    )
    assert result.status_code == 201
    other_id = result.json()["id"]
    approve(client, case_id=other_id)
    act(client, "payment", case_id=other_id)
    before = detail(client, other_id)
    other_calls = [c for c in client.get("/api/connectors").json() if c["case_id"] == other_id]
    progress(client, 6)
    for _ in range(2):
        assert client.post("/api/simulation/reset").status_code == 200
        assert detail(client, other_id) == before
        assert [
            c for c in client.get("/api/connectors").json() if c["case_id"] == other_id
        ] == other_calls
    with sessions() as db:
        assert db.get(Signup, signup_id) is not None
        assert db.scalar(select(func.count()).select_from(Signup)) == 1
    assert client.get("/api/assets/asset-kent-purifier").status_code == 200


def test_seed_is_idempotent_and_does_not_reset_progress(client, sessions):
    progress(client, 3)
    before = snapshot(client)
    with sessions() as db:
        seed_demo(db)
        db.commit()
    assert snapshot(client) == before


def test_sensitive_forms_are_never_in_connector_or_notification_logs(client):
    secret = "API_KEY=private_token tester@example.org"
    client.post("/api/cases", json={"asset_id": "asset-kent-purifier", "complaint": secret})
    client.post(
        "/api/cases/RK-2048/approval-requests", json={"kind": "share_sensitive", "reason": secret}
    )
    client.post("/api/signup", json=SIGNUP)
    for endpoint in ["connectors", "notifications", "decisions"]:
        payload = json.dumps(client.get("/api/" + endpoint).json())
        assert secret not in payload
        assert "tester@example.org" not in payload
