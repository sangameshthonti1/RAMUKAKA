import json

from fastapi.testclient import TestClient
from test_workspace import HOUSEHOLD, PROVIDER, approve_assign, post, quote, setup_case

from app.core.config import Settings
from app.main import create_app


def start(client, household="household-sangamesh"):
    return post(client, "/chat/conversations", {"household_id": household})


def send(client, session, text, **kwargs):
    return post(
        client,
        f"/chat/conversations/{session['id']}/messages",
        {"text": text, **kwargs},
        status=200,
    )


def test_chat_requires_explicit_asset_problem_and_confirm(client):
    session = start(client)
    assert session["messages"][0]["truth_label"] == "DOCUMENTATION_SIMULATION"
    session = send(client, session, "My water purifier is not working")
    assert session["stage"] == "await_asset"
    assert session["case_id"] is None
    session = send(client, session, "Kent water purifier", asset_id="asset-kent-purifier")
    assert session["stage"] == "await_problem"
    session = send(client, session, "Water flow has fallen since Monday")
    assert session["stage"] == "confirm_report"
    assert session["draft_complaint"] == "Water flow has fallen since Monday"
    assert session["messages"][-2]["truth_label"] == "REAL_HUMAN_INPUT"
    assert session["messages"][-1]["truth_label"] == "DOCUMENTATION_SIMULATION"
    before = len(client.get("/api/cases").json())
    assert send(client, session, "yes")["case_id"] is None
    assert len(client.get("/api/cases").json()) == before
    session = send(client, session, "Please create the case", action="confirm_report")
    assert session["case_id"].startswith("RK-") and session["case_id"] != "RK-2048"
    case = client.get("/api/cases/" + session["case_id"]).json()
    assert case["complaint"] == "Water flow has fallen since Monday"
    assert case["status"] == "awaiting_quote" and case["quote_amount"] is None
    assert (
        client.get("/api/chat/conversations/" + session["id"], headers=HOUSEHOLD).json() == session
    )
    assert any(
        row["id"] == session["id"]
        for row in client.get(
            "/api/chat/conversations",
            params={"household_id": "household-sangamesh"},
            headers=HOUSEHOLD,
        ).json()
    )


def test_cancel_draft_does_not_create_case(client):
    session = start(client)
    session = send(client, session, "Please repair", asset_id="asset-kent-purifier")
    session = send(client, session, "The machine is making a loud noise")
    session = send(client, session, "Cancel draft", action="cancel_report")
    assert session["stage"] == "ready" and not session["draft_complaint"] and not session["case_id"]
    assert "No new repair case" in session["messages"][-1]["content"]


def test_unknown_warranty_and_emergency_do_not_fake_outcomes(client):
    session = start(client)
    session = send(client, session, "Does my purifier have a warranty?")
    assert "warranty expiry not recorded" in session["messages"][-1]["content"]
    assert "not manufacturer-verified" in session["messages"][-1]["content"]
    session = send(client, session, "There is a gas leak and fire")
    assert "contact local emergency services" in session["messages"][-1]["content"]
    assert session["case_id"] is None
    assert (
        "not a live" in session["messages"][0]["content"].lower()
        or "not a live technician" in session["messages"][0]["content"].lower()
    )


def test_case_status_is_from_database_never_invented(client):
    session = start(client)
    session = send(client, session, "Check status of RK-2048")
    assert "₹749" in session["messages"][-1]["content"]
    assert "waiting for household approval" in session["messages"][-1]["content"].lower()
    assert "No quote has been recorded" not in session["messages"][-1]["content"]
    assert send(client, session, "Status RK-NOTREAL")["messages"][-1]["content"].startswith(
        "I couldn't find"
    )
    quote_text = json.dumps(session)
    assert "LIVE_API" not in quote_text


def test_provider_message_only_after_assignment_and_matches_provider(client):
    household, asset, provider, case = setup_case(client)
    session = start(client, household["id"])
    session = send(client, session, "Please repair my fridge")
    session = send(client, session, "Use the refrigerator", asset_id=asset["id"])
    session = send(client, session, "The refrigerator is not cooling properly")
    session = send(client, session, "Confirm", action="confirm_report")
    assert (
        client.get(
            f"/api/chat/cases/{case['id']}/conversations",
            params={"provider_id": provider["id"]},
            headers=PROVIDER,
        ).status_code
        == 403
    )
    chat_case_id = session["case_id"]
    case = client.get("/api/cases/" + chat_case_id).json()
    case = approve_assign(client, quote(client, case, provider))
    response = client.get(
        f"/api/chat/cases/{chat_case_id}/conversations",
        params={"provider_id": provider["id"]},
        headers=PROVIDER,
    )
    assert response.status_code == 200 and response.json()[0]["id"] == session["id"]
    assert post(
        client,
        f"/chat/conversations/{session['id']}/provider-messages",
        {"provider_id": "provider-kent-care", "text": "False claim"},
        PROVIDER,
        403,
    )["detail"]
    result = post(
        client,
        f"/chat/conversations/{session['id']}/provider-messages",
        {"provider_id": provider["id"], "text": "I have reviewed the reported issue locally"},
        PROVIDER,
        200,
    )
    assert result["messages"][-1]["role"] == "provider"
    assert result["messages"][-1]["truth_label"] == "REAL_HUMAN_INPUT"
    assert (
        client.get("/api/chat/conversations/" + session["id"], headers=HOUSEHOLD).json()[
            "messages"
        ][-1]["role"]
        == "provider"
    )


def test_other_household_asset_and_invalid_confirmation_rejected(client):
    household, asset, _, _ = setup_case(client)
    session = start(client)
    response = client.post(
        f"/api/chat/conversations/{session['id']}/messages",
        json={"text": "Other appliance", "asset_id": asset["id"]},
        headers=HOUSEHOLD,
    )
    assert response.status_code == 404
    response = client.post(
        f"/api/chat/conversations/{session['id']}/messages",
        json={"text": "Yes", "action": "confirm_report"},
        headers=HOUSEHOLD,
    )
    assert response.status_code == 409
    assert (
        client.post(
            "/api/chat/conversations", json={"household_id": household["id"]}, headers=PROVIDER
        ).status_code
        == 403
    )


def test_chat_survives_restart_and_demo_reset(local_directory):
    settings = Settings(database_url="sqlite:///" + str(local_directory / "chat.db"))
    with TestClient(create_app(settings)) as first:
        session = start(first)
        session = send(first, session, "Status RK-2048")
        first.post("/api/simulation/reset")
    with TestClient(create_app(settings)) as second:
        saved = second.get("/api/chat/conversations/" + session["id"], headers=HOUSEHOLD).json()
        assert saved["id"] == session["id"]
        assert saved["case_id"] is None  # RK-2048 was reset; chat history survives.
        assert saved["messages"] == session["messages"]
        assert len(saved["messages"]) == 3
