import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.main import create_app

HOUSEHOLD = {"X-Demo-Role": "household"}
PROVIDER = {"X-Demo-Role": "provider"}


def post(client, path, body, role=HOUSEHOLD, status=201):
    response = client.post("/api" + path, json=body, headers=role)
    assert response.status_code == status, response.text
    return response.json()


def setup_case(client, category="refrigerator"):
    home = post(client, "/households", {"name": "Test home", "member_name": "Local member"})
    asset = post(
        client,
        "/assets",
        {
            "household_id": home["id"],
            "name": "Kitchen appliance",
            "category": category,
            "location": "Kitchen",
            "installed_on": "2024-01-01",
        },
    )
    provider = post(client, "/providers", {"name": "Local provider", "trade": category}, PROVIDER)
    case = post(client, "/cases", {"asset_id": asset["id"], "complaint": "Not working as expected"})
    return home, asset, provider, case


def quote(client, case, provider, amount=1200, status=200):
    return post(
        client,
        f"/cases/{case['id']}/quote",
        {
            "provider_id": provider["id"],
            "amount": amount,
            "service_description": "Replace failed thermostat and check cooling",
            "expected_revision": case["service_revision"],
        },
        PROVIDER,
        status,
    )


def approve_assign(client, case):
    post(
        client,
        f"/cases/{case['id']}/approvals",
        {"kind": "spend", "decision": "approved"},
        status=200,
    )
    return post(client, f"/cases/{case['id']}/actions", {"action": "payment"}, status=200)


def report(client, case, provider, status=201):
    return post(
        client,
        f"/cases/{case['id']}/service-reports",
        {
            "provider_id": provider["id"],
            "expected_revision": case["service_revision"],
            "work_performed": "Replaced the faulty thermostat.",
            "observed_result": "Measured the documented cooling result.",
            "proof_file_name": "completion.jpg",
            "proof_media_type": "image/jpeg",
            "proof_size_bytes": 2048,
            "proof_sha256": "a" * 64,
            "proof_captured_at": "2026-10-04T17:20:00.000Z",
        },
        PROVIDER,
        status,
    )


def confirm(client, case, party, value=True):
    return post(
        client,
        f"/cases/{case['id']}/{party}-confirmation",
        {"confirmed": value, "note": "Local observation recorded for this test"},
        PROVIDER if party == "provider" else HOUSEHOLD,
        200,
    )


@pytest.mark.parametrize(
    "category", ["water_purifier", "air_conditioner", "refrigerator", "washing_machine", "other"]
)
def test_new_case_full_lifecycle_without_simulation(client, category):
    home, asset, provider, case = setup_case(client, category)
    assert case["status"] == "awaiting_quote"
    assert case["quote_amount"] is None and case["provider_id"] is None
    assert not case["approvals"]
    for record in (home, asset, provider):
        assert record["truth_label"] == "REAL_HUMAN_INPUT"
        assert record["updated_at"]
    post(client, f"/cases/{case['id']}/actions", {"action": "payment"}, status=403)
    case = quote(client, case, provider)
    assert case["quote_amount"] == 1200 and case["approvals"][0]["amount"] == 1200
    report(client, case, provider, 403)
    case = approve_assign(client, case)
    assert case["assigned"]
    post(
        client,
        f"/cases/{case['id']}/household-confirmation",
        {"confirmed": True, "note": "No evidence yet"},
        status=409,
    )
    case = report(client, case, provider)
    assert case["evidence"][-1]["truth_label"] == "REAL_HUMAN_INPUT"
    assert case["evidence"][-1]["service_revision"] == case["service_revision"]
    case = confirm(client, case, "provider")
    assert case["status"] != "closed"
    case = confirm(client, case, "household")
    assert case["status"] == "closed"
    case = confirm(client, case, "household", False)
    assert case["status"] == "reopened"
    case = report(client, case, provider)
    assert not case["provider_confirmed"] and not case["household_confirmed"]
    assert confirm(client, case, "household")["status"] != "closed"
    assert confirm(client, case, "provider")["status"] == "closed"
    post(client, "/simulation/reset", {}, status=200)
    assert client.get(f"/api/cases/{case['id']}").json()["status"] == "closed"
    assert client.get(f"/api/assets/{asset['id']}").json()["cases"][0]["id"] == case["id"]


def test_repricing_invalidates_approval_and_stale_forms(client):
    _, _, provider, case = setup_case(client)
    case = quote(client, case, provider)
    previous = case
    post(
        client,
        f"/cases/{case['id']}/approvals",
        {"kind": "spend", "decision": "approved"},
        status=200,
    )
    case = quote(client, case, provider, 1500)
    assert case["service_revision"] > previous["service_revision"]
    assert case["approvals"][0]["status"] == "rejected"
    post(client, f"/cases/{case['id']}/actions", {"action": "payment"}, status=403)
    quote(client, previous, provider, status=409)
    case = approve_assign(client, case)
    quote(client, case, provider, status=409)


def test_provider_switch_cannot_bypass_approval_via_quote(client):
    _, _, provider, case = setup_case(client)
    case = quote(client, case, provider)
    other = post(
        client, "/providers", {"name": "Another provider", "trade": "refrigerator"}, PROVIDER
    )
    quote(client, case, other, status=403)
    wrong_trade = post(client, "/providers", {"name": "Wrong trade", "trade": "other"}, PROVIDER)
    quote(client, case, wrong_trade, status=409)


def test_service_report_is_bound_to_assignment_and_rejects_forged_label(client):
    _, _, provider, case = setup_case(client)
    case = approve_assign(client, quote(client, case, provider))
    wrong = dict(provider, id="provider-kent-care")
    report(client, case, wrong, 409)
    report(client, dict(case, service_revision=1), provider, 409)
    body = {
        "provider_id": provider["id"],
        "expected_revision": case["service_revision"],
        "work_performed": "Recorded replacement",
        "observed_result": "Cooling result recorded",
        "truth_label": "LIVE_API",
    }
    post(client, f"/cases/{case['id']}/service-reports", body, PROVIDER, 422)


def test_service_report_records_complete_tamper_evident_media_receipt(client):
    _, _, provider, case = setup_case(client)
    case = approve_assign(client, quote(client, case, provider))
    body = {
        "provider_id": provider["id"],
        "expected_revision": case["service_revision"],
        "work_performed": "Recorded replacement and connection checks",
        "observed_result": "Recorded normal cooling during the final test",
        "proof_file_name": "completion.jpg",
        "proof_media_type": "image/jpeg",
        "proof_size_bytes": 2048,
        "proof_sha256": "a" * 64,
        "proof_captured_at": "2026-10-04T17:20:00.000Z",
    }
    updated = post(
        client,
        f"/cases/{case['id']}/service-reports",
        body,
        PROVIDER,
    )
    evidence = updated["evidence"][-1]
    assert "SHA-256 " + "a" * 64 in evidence["description"]
    assert "tamper-evident" in evidence["source"]
    assert "not independently verified" in evidence["source"]


def test_service_report_rejects_partial_media_receipt(client):
    _, _, provider, case = setup_case(client)
    case = approve_assign(client, quote(client, case, provider))
    body = {
        "provider_id": provider["id"],
        "expected_revision": case["service_revision"],
        "work_performed": "Recorded replacement and connection checks",
        "observed_result": "Recorded normal cooling during the final test",
        "proof_file_name": "completion.jpg",
    }
    post(
        client,
        f"/cases/{case['id']}/service-reports",
        body,
        PROVIDER,
        422,
    )


@pytest.mark.parametrize("amount", [-1, 1000001, 1.5, True, "1200"])
def test_quote_amount_validation(client, amount):
    _, _, provider, case = setup_case(client)
    quote(client, case, provider, amount, 422)


def test_explicit_local_role_required_for_workspace_edits(client):
    post(client, "/households", {"name": "Home", "member_name": "Member"}, role={}, status=403)
    post(client, "/providers", {"name": "Provider", "trade": "other"}, HOUSEHOLD, 403)
    _, _, provider, case = setup_case(client)
    post(
        client,
        f"/cases/{case['id']}/quote",
        {
            "provider_id": provider["id"],
            "amount": 1200,
            "service_description": "Recorded inspection",
            "expected_revision": 1,
        },
        HOUSEHOLD,
        403,
    )


def test_asset_retirement_keeps_history_and_refuses_open_work(client):
    home, asset, provider, case = setup_case(client)
    updated = post(client, f"/households/{home['id']}/participants", {"name": "Second member"})
    assert len(updated["participants"]) == 2
    body = {
        "name": asset["name"],
        "brand": "Recorded brand",
        "model": "Model",
        "location": "Kitchen",
        "notes": "Retired",
        "status": "retired",
    }
    assert (
        client.patch(f"/api/assets/{asset['id']}", json=body, headers=HOUSEHOLD).status_code == 409
    )
    case = report(client, approve_assign(client, quote(client, case, provider)), provider)
    confirm(client, case, "provider")
    confirm(client, case, "household")
    response = client.patch(f"/api/assets/{asset['id']}", json=body, headers=HOUSEHOLD)
    assert response.status_code == 200
    assert response.json()["truth_label"] == "REAL_HUMAN_INPUT"
    post(client, "/cases", {"asset_id": asset["id"], "complaint": "Another issue"}, status=409)
    assert len(client.get(f"/api/assets/{asset['id']}").json()["cases"]) == 1


def test_records_survive_backend_restart(local_directory):
    settings = Settings(database_url="sqlite:///" + str(local_directory / "persistent.db"))
    with TestClient(create_app(settings)) as first:
        home, asset, provider, case = setup_case(first)
        case = quote(first, case, provider)
    with TestClient(create_app(settings)) as restarted:
        assert restarted.get(f"/api/cases/{case['id']}").json() == case
        assert restarted.get(f"/api/assets/{asset['id']}").json()["asset"] == asset
        assert any(h["id"] == home["id"] for h in restarted.get("/api/households").json())


def test_provider_availability_is_checked_at_execution(client):
    _, _, provider, case = setup_case(client)
    case = quote(client, case, provider)
    response = client.patch(
        f"/api/providers/{provider['id']}",
        json={"name": provider["name"], "status": "unavailable"},
        headers=PROVIDER,
    )
    assert response.status_code == 200
    post(
        client,
        f"/cases/{case['id']}/approvals",
        {"kind": "spend", "decision": "approved"},
        status=200,
    )
    post(client, f"/cases/{case['id']}/actions", {"action": "payment"}, status=409)


def test_cancel_preserves_record_revokes_approval_and_allows_retirement(client):
    _, asset, provider, case = setup_case(client)
    case = quote(client, case, provider)
    assert post(
        client, f"/cases/{case['id']}/cancel", {"reason": "Work is no longer needed"}, PROVIDER, 403
    )["detail"]
    cancelled = post(
        client, f"/cases/{case['id']}/cancel", {"reason": "Work is no longer needed"}, status=200
    )
    assert cancelled["status"] == "cancelled"
    assert cancelled["approvals"][-1]["status"] == "rejected"
    assert cancelled["events"][-1]["truth_label"] == "REAL_HUMAN_INPUT"
    post(client, f"/cases/{case['id']}/actions", {"action": "payment"}, status=403)
    quote(client, cancelled, provider, status=409)
    body = {
        "name": asset["name"],
        "brand": asset["brand"],
        "model": asset["model"],
        "location": asset["location"],
        "notes": "No active cases",
        "status": "retired",
    }
    assert (
        client.patch(f"/api/assets/{asset['id']}", json=body, headers=HOUSEHOLD).status_code == 200
    )
    assert client.get(f"/api/cases/{case['id']}").json()["status"] == "cancelled"


def test_provider_change_requires_new_provider_quote_not_inherited_price(client):
    _, _, first, case = setup_case(client)
    case = quote(client, case, first)
    second = post(
        client,
        "/providers",
        {"name": "Second eligible provider", "trade": "refrigerator"},
        PROVIDER,
    )
    post(
        client,
        f"/cases/{case['id']}/approval-requests",
        {
            "kind": "change_provider",
            "reason": "Household requests alternate",
            "target_provider_id": second["id"],
        },
        status=200,
    )
    post(
        client,
        f"/cases/{case['id']}/approvals",
        {"kind": "change_provider", "decision": "approved"},
        status=200,
    )
    case = post(client, f"/cases/{case['id']}/actions", {"action": "change_provider"}, status=200)
    assert case["provider_id"] == second["id"]
    assert case["status"] == "awaiting_quote"
    assert case["quote_amount"] is None and case["service_description"] is None
    post(client, f"/cases/{case['id']}/actions", {"action": "payment"}, status=403)
    case = quote(client, case, second, amount=1500)
    assert case["approvals"][-1]["amount"] == 1500
    assert case["status"] == "waiting_for_approval"


def test_cancel_after_assignment_refused(client):
    _, _, provider, case = setup_case(client)
    case = approve_assign(client, quote(client, case, provider))
    assert post(client, f"/cases/{case['id']}/cancel", {"reason": "Cannot erase work"}, status=409)[
        "detail"
    ]
    assert client.get(f"/api/cases/{case['id']}").json()["assigned"] is True
