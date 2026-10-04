from datetime import datetime, timezone

import pytest
from conftest import detail

SUMMARY = {
    "id",
    "household_id",
    "asset_id",
    "title",
    "complaint",
    "service_category",
    "service_description",
    "service_revision",
    "assigned",
    "status",
    "quote_amount",
    "provider_id",
    "provider_confirmed",
    "household_confirmed",
    "created_at",
    "updated_at",
}
DETAIL = SUMMARY | {"events", "approvals", "evidence", "decisions"}


def test_health_and_seed_contract(client):
    assert client.get("/health").json() == {"status": "ok", "connector_mode": "mock"}
    case = detail(client)
    assert set(case) == DETAIL
    assert case["status"] == "waiting_for_approval"
    assert case["quote_amount"] == 749
    assert case["complaint"] == "Low water flow"
    assert not case["provider_confirmed"] and not case["household_confirmed"]
    assert len(case["events"]) == 6
    assert [e["type"] for e in case["events"]] == [
        "report",
        "classification",
        "asset_history",
        "provider_selection",
        "quote",
        "approval_request",
    ]
    assert all(e["truth_label"] == "DOCUMENTATION_SIMULATION" for e in case["events"])
    assert case["approvals"][0]["status"] == "pending"
    assert set(case["approvals"][0]) == {
        "id",
        "case_id",
        "kind",
        "status",
        "amount",
        "reason",
        "created_at",
        "updated_at",
    }
    assert set(case["events"][0]) == {
        "id",
        "case_id",
        "type",
        "title",
        "detail",
        "truth_label",
        "created_at",
    }
    assert set(case["evidence"][0]) == {
        "kind",
        "service_revision",
        "provider_id",
        "id",
        "case_id",
        "title",
        "description",
        "truth_label",
        "source",
        "created_at",
    }
    assert set(case["decisions"][0]) == {
        "id",
        "case_id",
        "action",
        "reason",
        "rule",
        "truth_label",
        "created_at",
    }
    for value in [
        case["created_at"],
        case["updated_at"],
        *[e["created_at"] for e in case["events"]],
    ]:
        assert datetime.fromisoformat(value.replace("Z", "+00:00")).utcoffset().total_seconds() == 0


@pytest.mark.parametrize(
    "endpoint",
    [
        "households",
        "assets",
        "cases",
        "decisions",
        "evidence",
        "connectors",
        "providers",
        "notifications",
        "rails",
    ],
)
def test_list_endpoints(client, endpoint):
    response = client.get("/api/" + endpoint)
    assert response.status_code == 200
    assert isinstance(response.json(), list)
    assert response.json()


def test_asset_and_household_shapes(client):
    household = client.get("/api/households").json()[0]
    assert set(household) == {
        "id",
        "name",
        "created_at",
        "updated_at",
        "truth_label",
        "participants",
        "address",
        "latitude",
        "longitude",
    }
    assert household["participants"][0]["name"] == "Sangamesh"
    assert set(household["participants"][0]) == {
        "id",
        "name",
        "role",
        "created_at",
        "updated_at",
        "truth_label",
    }
    asset = client.get("/api/assets").json()[0]
    assert asset["brand"] == "Kent"
    assert set(asset) == {
        "category",
        "truth_label",
        "updated_at",
        "id",
        "household_id",
        "name",
        "brand",
        "model",
        "location",
        "installed_on",
        "purchased_on",
        "warranty_until",
        "next_service_on",
        "serial_number",
        "notes",
        "status",
        "created_at",
    }
    response = client.get("/api/assets/" + asset["id"])
    assert set(response.json()) == {"asset", "cases"}
    assert set(response.json()["cases"][0]) == SUMMARY


def test_connector_provider_notification_shapes(client):
    call = client.get("/api/connectors").json()[0]
    assert set(call) == {
        "id",
        "case_id",
        "connector",
        "operation",
        "request",
        "response",
        "truth_label",
        "status",
        "created_at",
    }
    provider = client.get("/api/providers").json()[0]
    assert set(provider) == {
        "id",
        "name",
        "trade",
        "status",
        "shop_address",
        "latitude",
        "longitude",
        "created_at",
        "updated_at",
        "truth_label",
    }
    note = client.get("/api/notifications").json()[0]
    assert set(note) == {
        "id",
        "case_id",
        "channel",
        "message",
        "truth_label",
        "status",
        "created_at",
    }


def test_create_case_is_human_input_without_invented_plan(client):
    response = client.post(
        "/api/cases",
        json={"asset_id": "asset-kent-purifier", "complaint": "Water flow is still slow"},
    )
    assert response.status_code == 201
    case = response.json()
    assert set(case) == DETAIL
    assert case["id"] != "RK-2048"
    assert case["events"][0]["truth_label"] == "REAL_HUMAN_INPUT"
    assert case["events"][0]["detail"] == "Water flow is still slow"
    assert len(case["events"]) == 1
    assert case["status"] == "awaiting_quote"
    assert case["quote_amount"] is None and case["provider_id"] is None
    assert not case["approvals"]
    assert len(client.get("/api/assets/asset-kent-purifier").json()["cases"]) == 2


@pytest.mark.parametrize("endpoint", ["/api/assets/missing", "/api/cases/missing"])
def test_missing_get(client, endpoint):
    response = client.get(endpoint)
    assert response.status_code == 404
    assert isinstance(response.json()["detail"], str)


@pytest.mark.parametrize(
    "suffix,body",
    [
        ("events", {"type": "customer_note", "detail": "Hi"}),
        ("approvals", {"kind": "spend", "decision": "approved"}),
        ("approval-requests", {"kind": "share_sensitive", "reason": "Need it"}),
        ("actions", {"action": "payment"}),
        ("provider-confirmation", {"confirmed": True, "note": "Done"}),
        ("household-confirmation", {"confirmed": True, "note": "Done"}),
    ],
)
def test_missing_case_mutations(client, suffix, body):
    assert client.post("/api/cases/missing/" + suffix, json=body).status_code == 404


@pytest.mark.parametrize(
    "body",
    [
        {"asset_id": "asset-kent-purifier", "complaint": " "},
        {"asset_id": "asset-kent-purifier", "complaint": "x" * 2001},
        {"asset_id": "asset-kent-purifier", "complaint": "slow", "quote_amount": 1},
        {"asset_id": 123, "complaint": "slow"},
    ],
)
def test_case_validation(client, body):
    response = client.post("/api/cases", json=body)
    assert response.status_code == 422
    assert isinstance(response.json()["detail"], list)


def test_unknown_asset(client):
    assert (
        client.post("/api/cases", json={"asset_id": "missing", "complaint": "Slow"}).status_code
        == 404
    )


def test_cors_is_one_local_origin(client):
    allowed = client.options(
        "/api/cases",
        headers={"Origin": "http://localhost:5173", "Access-Control-Request-Method": "POST"},
    )
    assert allowed.status_code == 200
    assert allowed.headers["access-control-allow-origin"] == "http://localhost:5173"
    for origin in ["https://evil.example", "http://localhost:5174", "null"]:
        denied = client.options(
            "/api/cases", headers={"Origin": origin, "Access-Control-Request-Method": "POST"}
        )
        assert denied.status_code == 400
        assert "access-control-allow-origin" not in denied.headers


def test_system_prompt(client):
    response = client.get("/api/system-prompt")
    assert response.status_code == 200
    assert set(response.json()) == {"prompt"}
    assert "Backend services are authoritative" in response.json()["prompt"]
