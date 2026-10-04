import pytest
from conftest import act, approve, confirm, detail, progress
from sqlalchemy import select

from app.models import Approval, Evidence, Provider, ServiceCase


def test_six_step_simulation_and_truth_labels(client):
    assert client.get("/api/simulation").json() == {
        "step": 0,
        "total_steps": 6,
        "next_event": "customer approval",
        "complete": False,
        "case_id": "RK-2048",
    }
    for index in range(1, 7):
        response = client.post("/api/simulation/next")
        assert response.status_code == 200, response.text
        assert response.json()["step"] == index
        case = detail(client)
        assert len(case["events"]) == 6 + index
        assert case["status"] == "closed" if index == 6 else case["status"] != "closed"
    final = detail(client)
    assert final["provider_confirmed"] and final["household_confirmed"]
    assert all(e["truth_label"] == "DOCUMENTATION_SIMULATION" for e in final["events"])
    assert all(d["truth_label"] == "DOCUMENTATION_SIMULATION" for d in final["decisions"])
    assert client.post("/api/simulation/next").json()["complete"] is True
    assert detail(client) == final
    assert client.get("/api/simulation").json()["next_event"] is None


@pytest.mark.parametrize("party", ["provider", "household"])
@pytest.mark.parametrize("steps", [0, 1, 2])
def test_confirmation_requires_real_service_evidence_not_asset_context(client, party, steps):
    progress(client, steps)
    response = confirm(client, party)
    assert response.status_code == 409
    assert detail(client)[party + "_confirmed"] is False
    assert detail(client)["decisions"][-1]["rule"] == "CURRENT_SERVICE_EVIDENCE"


@pytest.mark.parametrize("first,second", [("provider", "household"), ("household", "provider")])
def test_manual_second_party_closes_using_same_guard(client, first, second):
    progress(client, 3)
    assert confirm(client, first).status_code == 200
    assert detail(client)["status"] != "closed"
    response = confirm(client, second)
    assert response.status_code == 200
    assert response.json()["status"] == "closed"
    assert any(
        d["rule"] == "BOTH_PARTIES_AND_SERVICE_EVIDENCE" for d in response.json()["decisions"]
    )


@pytest.mark.parametrize("party", ["provider", "household"])
def test_unresolved_reopens_and_can_be_reconfirmed(client, party):
    progress(client, 6)
    response = confirm(client, party, False)
    assert response.status_code == 200
    assert response.json()["status"] == "reopened"
    assert not response.json()[party + "_confirmed"]
    assert confirm(client, party, True).json()["status"] == "closed"


def test_simulation_does_not_erase_unresolved_human_feedback(client):
    progress(client, 3)
    assert confirm(client, "provider", False).status_code == 200
    assert client.post("/api/simulation/next").status_code == 409
    assert client.get("/api/simulation").json()["step"] == 3
    assert confirm(client, "provider", True).status_code == 200
    assert client.post("/api/simulation/next").status_code == 200


def test_rejected_spend_blocks_simulation_and_payment(client):
    response = client.post(
        "/api/cases/RK-2048/approvals", json={"kind": "spend", "decision": "rejected"}
    )
    assert response.status_code == 200
    assert client.post("/api/simulation/next").status_code == 409
    assert client.get("/api/simulation").json()["step"] == 0
    assert act(client, "payment").status_code == 403
    assert approve(client).status_code == 409
    assert detail(client)["approvals"][0]["status"] == "rejected"


def test_manual_approval_then_simulation_preserves_authorization(client):
    assert approve(client).status_code == 200
    progress(client, 6)
    assert detail(client)["status"] == "closed"


def test_payment_requires_approval_and_is_idempotent(client):
    assert act(client, "payment").status_code == 403
    assert approve(client).status_code == 200
    assert act(client, "payment").status_code == 200
    assert act(client, "payment").status_code == 200
    progress(client, 6)
    assert act(client, "payment").status_code == 200
    calls = [c for c in client.get("/api/connectors").json() if c["operation"] == "payment"]
    assert len(calls) == 1
    assert calls[0]["request"]["amount"] == 749
    assert calls[0]["response"]["external_effect"] is False
    assert calls[0]["response"]["payment_status"] == "mock_succeeded"


def test_approved_amount_cannot_be_reused_after_quote_changes(client, sessions):
    assert approve(client).status_code == 200
    with sessions() as db:
        db.get(ServiceCase, "RK-2048").quote_amount = 750
        db.commit()
    assert act(client, "payment").status_code == 403
    assert not [c for c in client.get("/api/connectors").json() if c["operation"] == "payment"]


def test_stale_pending_approval_cannot_be_resolved(client, sessions):
    with sessions() as db:
        db.get(ServiceCase, "RK-2048").quote_amount = 750
        db.commit()
    assert approve(client).status_code == 409


def test_provider_unavailable_after_approval_rolls_back_payment(client, sessions):
    approve(client)
    with sessions() as db:
        db.get(Provider, "provider-kent-care").status = "unavailable"
        db.commit()
    assert act(client, "payment").status_code == 409
    with sessions() as db:
        approval = db.scalar(select(Approval).where(Approval.kind == "spend"))
        assert not approval.consumed
    assert not [c for c in client.get("/api/connectors").json() if c["operation"] == "payment"]


@pytest.mark.parametrize("mutation", ["assignment", "approval", "revision", "provider"])
def test_confirmation_guard_checks_full_service_scope(client, sessions, mutation):
    progress(client, 3)
    with sessions() as db:
        case = db.get(ServiceCase, "RK-2048")
        if mutation == "assignment":
            case.assigned = False
        elif mutation == "approval":
            db.scalar(select(Approval).where(Approval.kind == "spend")).status = "rejected"
        elif mutation == "revision":
            evidence = db.scalar(select(Evidence).where(Evidence.kind == "service"))
            evidence.service_revision = 999
        else:
            evidence = db.scalar(select(Evidence).where(Evidence.kind == "service"))
            evidence.provider_id = "provider-aqua-care"
        db.commit()
    assert confirm(client, "provider").status_code == 409


def test_final_closure_guard_rechecks_evidence(client, sessions):
    progress(client, 5)
    with sessions() as db:
        evidence = db.scalar(select(Evidence).where(Evidence.kind == "service"))
        db.delete(evidence)
        db.commit()
    assert client.post("/api/simulation/next").status_code == 409
    assert detail(client)["status"] != "closed"
    assert client.get("/api/simulation").json()["step"] == 5
