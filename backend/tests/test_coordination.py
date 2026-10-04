import pytest

from app.models import Household, Provider, ServiceCase
from app.models.entities import RepairCoordination

HOUSEHOLD = {"X-Demo-Role": "household"}
PROVIDER = {"X-Demo-Role": "provider"}


def setup_case(client):
    household = client.get("/api/households").json()[0]
    response = client.patch(
        f"/api/households/{household['id']}/location",
        headers=HOUSEHOLD,
        json={"address": "Recorded home", "latitude": 0, "longitude": 0},
    )
    assert response.status_code == 200, response.text
    asset = next(
        a for a in client.get("/api/assets").json() if a["household_id"] == household["id"]
    )
    providers = []
    for name, longitude in (("Far shop", 2), ("Near shop", 1), ("Unknown shop", None)):
        body = {"name": name, "trade": asset["category"], "shop_address": name}
        if longitude is not None:
            body.update(latitude=0, longitude=longitude)
        response = client.post("/api/providers", headers=PROVIDER, json=body)
        assert response.status_code == 201, response.text
        providers.append(response.json())
    response = client.post(
        "/api/cases", json={"asset_id": asset["id"], "complaint": "Repair needed"}
    )
    assert response.status_code == 201, response.text
    return response.json(), providers


def start(client, case):
    response = client.post(
        f"/api/cases/{case['id']}/coordination/start",
        headers=HOUSEHOLD,
        json={"expected_revision": case["service_revision"]},
    )
    assert response.status_code == 200, response.text
    return response.json()["state"]


def consent(client, case_id, state, cost=True, timing=True):
    return client.post(
        f"/api/cases/{case_id}/coordination/consent",
        headers=HOUSEHOLD,
        json={"offer_id": state["offer_id"], "approve_cost": cost, "approve_timing": timing},
    )


def respond(client, case_id, state, response):
    return client.post(
        f"/api/cases/{case_id}/coordination/mock-provider-response",
        headers=PROVIDER,
        json={"offer_id": state["offer_id"], "response": response},
    )


def test_distance_and_persisted_offer(client, sessions):
    case, providers = setup_case(client)
    nearby = client.get(f"/api/cases/{case['id']}/nearby-providers").json()
    assert [p["provider_id"] for p in nearby["providers"]] == [
        providers[1]["id"],
        providers[0]["id"],
    ]
    assert nearby["providers"][0]["distance_km"] == pytest.approx(111.19508, abs=0.001)
    state = start(client, case)
    assert state["selected_shop"]["provider_id"] == providers[1]["id"]
    assert state["total_cost_inr"] == 1500
    assert state["scheduled_start"].endswith("+00:00")
    assert state["scheduled_end"].endswith("+00:00")
    assert all(m["truth_label"] == "DOCUMENTATION_SIMULATION" for m in state["messages"])
    with sessions() as db:
        record = db.query(RepairCoordination).filter_by(case_id=case["id"]).one()
        assert record.state == state
    current = client.get(f"/api/cases/{case['id']}").json()
    replay = client.post(
        f"/api/cases/{case['id']}/coordination/start",
        headers=HOUSEHOLD,
        json={"expected_revision": current["service_revision"]},
    )
    assert replay.json()["state"] == state
    assert (
        client.get(f"/api/cases/{case['id']}/coordination").json()["real_calls_supported"] is False
    )


@pytest.mark.parametrize("cost,timing", [(True, False), (False, True), (False, False)])
def test_both_consents_required_and_legacy_action_guard(client, cost, timing):
    case, _ = setup_case(client)
    state = start(client, case)
    assert consent(client, case["id"], state, cost, timing).status_code == 200
    assert respond(client, case["id"], state, "complete").status_code == 409
    assert (
        client.post(
            f"/api/cases/{case['id']}/approvals", json={"kind": "spend", "decision": "approved"}
        ).status_code
        == 200
    )
    assert (
        client.post(f"/api/cases/{case['id']}/actions", json={"action": "payment"}).status_code
        == 403
    )
    assert not client.get(f"/api/cases/{case['id']}").json()["assigned"]
    # Exact full decision can consume an already approved cost authorization.
    assert consent(client, case["id"], state).status_code == 200


def test_completion_notifies_without_household_confirmation(client):
    case, _ = setup_case(client)
    state = start(client, case)
    assert consent(client, case["id"], state).status_code == 200
    connector_count = len(client.get("/api/connectors").json())
    assert consent(client, case["id"], state).status_code == 200
    assert len(client.get("/api/connectors").json()) == connector_count
    assert respond(client, case["id"], state, "complete").status_code == 200
    detail = client.get(f"/api/cases/{case['id']}").json()
    assert detail["assigned"] and detail["provider_confirmed"]
    assert not detail["household_confirmed"]
    assert detail["status"] == "awaiting_confirmation"
    assert detail["evidence"][-1]["truth_label"] == "DOCUMENTATION_SIMULATION"
    notifications = client.get("/api/notifications").json()
    assert any(
        n["case_id"] == case["id"] and "not verified closure" in n["message"] for n in notifications
    )
    assert respond(client, case["id"], state, "complete").status_code == 200
    assert len(client.get("/api/notifications").json()) == len(notifications)
    response = client.post(
        f"/api/cases/{case['id']}/household-confirmation",
        headers=HOUSEHOLD,
        json={"confirmed": True, "note": "Household explicitly confirms mock result"},
    )
    assert response.status_code == 200, response.text
    assert response.json()["status"] == "closed"


def test_decline_stale_offer_and_unavailable_provider(client, sessions):
    case, providers = setup_case(client)
    state = start(client, case)
    assert respond(client, case["id"], state, "decline").status_code == 200
    assert consent(client, case["id"], state).status_code == 409
    assert respond(client, case["id"], state, "accept").status_code == 200
    wrong = dict(state, offer_id="wrong")
    assert consent(client, case["id"], wrong).status_code == 409
    with sessions() as db:
        db.get(Provider, providers[1]["id"]).status = "unavailable"
        db.commit()
    assert consent(client, case["id"], state).status_code == 409
    persisted = client.get(f"/api/cases/{case['id']}/coordination").json()["state"]
    assert not persisted["cost_approved"] and not persisted["timing_approved"]
    with sessions() as db:
        db.get(ServiceCase, case["id"]).service_revision += 1
        db.commit()
    assert consent(client, case["id"], state).status_code == 409


def test_missing_coordinates_no_fake_nearest(client, sessions):
    case, providers = setup_case(client)
    with sessions() as db:
        for p in providers:
            db.get(Provider, p["id"]).latitude = None
            db.get(Provider, p["id"]).longitude = None
        db.commit()
    assert client.get(f"/api/cases/{case['id']}/nearby-providers").json()["providers"] == []
    assert (
        client.post(
            f"/api/cases/{case['id']}/coordination/start",
            headers=HOUSEHOLD,
            json={"expected_revision": case["service_revision"]},
        ).status_code
        == 409
    )
    with sessions() as db:
        db.get(Household, case["household_id"]).latitude = None
        db.commit()
    assert client.get(f"/api/cases/{case['id']}/nearby-providers").status_code == 409


def test_partial_consents_do_not_accumulate(client):
    case, _ = setup_case(client)
    state = start(client, case)
    assert consent(client, case["id"], state, True, False).status_code == 200
    assert consent(client, case["id"], state, False, True).status_code == 200
    detail = client.get(f"/api/cases/{case['id']}").json()
    assert not detail["assigned"]
    assert detail["approvals"][-1]["status"] == "pending"


def test_household_unresolved_is_not_closed_by_completion_replay(client):
    case, _ = setup_case(client)
    state = start(client, case)
    assert consent(client, case["id"], state).status_code == 200
    assert respond(client, case["id"], state, "complete").status_code == 200
    response = client.post(
        f"/api/cases/{case['id']}/household-confirmation",
        headers=HOUSEHOLD,
        json={"confirmed": False, "note": "Household reports unresolved repair"},
    )
    assert response.status_code == 200
    assert response.json()["status"] == "reopened"
    assert respond(client, case["id"], state, "complete").status_code == 200
    detail = client.get(f"/api/cases/{case['id']}").json()
    assert detail["status"] == "reopened"
    assert not detail["household_confirmed"]


def test_location_validation_and_roles(client):
    case, providers = setup_case(client)
    path = f"/api/providers/{providers[0]['id']}/location"
    assert (
        client.patch(path, headers=PROVIDER, json={"latitude": 91, "longitude": 0}).status_code
        == 422
    )
    assert client.patch(path, headers=PROVIDER, json={"latitude": 0}).status_code == 422
    assert (
        client.patch(path, headers=HOUSEHOLD, json={"latitude": 0, "longitude": 0}).status_code
        == 403
    )
    state = start(client, case)
    assert (
        client.post(
            f"/api/cases/{case['id']}/coordination/consent",
            headers=PROVIDER,
            json={"offer_id": state["offer_id"], "approve_cost": True, "approve_timing": True},
        ).status_code
        == 403
    )
