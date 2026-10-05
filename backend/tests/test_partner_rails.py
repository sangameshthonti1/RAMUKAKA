import io

import httpx
from conftest import approve
from pydantic import SecretStr

from app.connectors import competition


def pine_body(value=74900):
    return {
        "connector": "Pine Labs",
        "operation": "create_payment_link",
        "endpoint": "https://pluraluat.v2.pinepg.in/api/pay/v1/paymentlink",
        "documentation_url": (
            "https://www.pinelabs.com/docs/online-payments/api/payment-links/"
            "create-payment-link"
        ),
        "request": {
            "amount": {"value": value, "currency": "INR"},
            "description": "RK-2048 filter replacement",
            "merchant_payment_link_reference": "RK-2048",
        },
        "response": {
            "payment_link": "https://shortener.v2.pinepg.in/PLUTUS/documentary",
            "payment_link_id": "pl-documentary-RK-2048",
            "status": "CREATED",
            "amount": {"value": value, "currency": "INR"},
        },
    }


def test_contracts_separate_live_and_documented_execution(client):
    response = client.get("/api/partner-rails/contracts")
    assert response.status_code == 200
    contracts = {item["connector"]: item for item in response.json()}
    assert contracts["Gnani"]["endpoint"] == "https://api.vachana.ai/stt/v3"
    assert contracts["Gnani"]["truth_label"] == "LIVE_API"
    assert contracts["Gnani"]["ready"] is False
    assert contracts["Pine Labs"]["execution"] == "documentation_simulation"
    assert contracts["Delhivery"]["execution"] == "wizard_documentation_input"


def test_documented_payment_response_requires_matching_approval(client):
    endpoint = "/api/partner-rails/RK-2048/documented-response"
    assert client.post(endpoint, json=pine_body()).status_code == 403
    assert approve(client).status_code == 200
    mismatch = client.post(endpoint, json=pine_body(75000))
    assert mismatch.status_code == 422
    response = client.post(endpoint, json=pine_body())
    assert response.status_code == 201, response.text
    call = response.json()
    assert call["truth_label"] == "DOCUMENTATION_SIMULATION"
    assert call["status"] == "documentation_response_recorded"
    assert call["request"]["approved_amount_inr"] == 749
    assert call["response"] == pine_body()["response"]


def test_delhivery_documented_response_accepts_only_official_sources(client):
    approve(client)
    body = {
        "connector": "Delhivery",
        "operation": "create_part_shipment",
        "endpoint": "https://track.delhivery.com/api/cmu/create.json",
        "documentation_url": "https://help.delhivery.com/docs/client-developer-portal-1",
        "request": {"reference": "RK-2048-filter"},
        "response": {"success": True, "waybill": "DOCUMENTARY-WAYBILL"},
    }
    endpoint = "/api/partner-rails/RK-2048/documented-response"
    malicious = dict(body, endpoint="https://evil-delhivery.com/api/create")
    assert client.post(endpoint, json=malicious).status_code == 422
    response = client.post(endpoint, json=body)
    assert response.status_code == 201, response.text
    assert response.json()["connector"] == "Delhivery"
    assert response.json()["response"] == body["response"]


def test_gnani_upload_fails_closed_without_local_key(client):
    response = client.post(
        "/api/partner-rails/RK-2048/gnani/transcribe",
        data={"language_code": "hi-IN"},
        files={"audio": ("note.wav", io.BytesIO(b"RIFF-demo"), "audio/wav")},
    )
    assert response.status_code == 503
    assert "GNANI_API_KEY" in response.json()["detail"]
    calls = [
        c
        for c in client.get("/api/connectors").json()
        if c["operation"] == "transcribe_audio"
    ]
    assert calls == []


def test_gnani_live_response_is_preserved_without_logging_secret(client, monkeypatch):
    secret = "local-test-key-never-log"
    client.app.state.settings.gnani_live_enabled = True
    client.app.state.settings.gnani_api_key = SecretStr(secret)

    class FakeClient:
        def __init__(self, **kwargs):
            assert kwargs["timeout"] == 45

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return None

        async def post(self, url, *, headers, data, files):
            assert url == "https://api.vachana.ai/stt/v3"
            assert headers == {"X-API-Key-ID": secret}
            assert data["language_code"] == "hi-IN"
            assert files["audio_file"][1] == b"RIFF-real-audio"
            return httpx.Response(
                200,
                json={
                    "success": True,
                    "request_id": "req_demo",
                    "transcript": "पानी धीरे आ रहा है",
                },
                request=httpx.Request("POST", url),
            )

    monkeypatch.setattr(competition.httpx, "AsyncClient", FakeClient)
    response = client.post(
        "/api/partner-rails/RK-2048/gnani/transcribe",
        data={"language_code": "hi-IN"},
        files={"audio": ("note.wav", io.BytesIO(b"RIFF-real-audio"), "audio/wav")},
    )
    assert response.status_code == 201, response.text
    call = response.json()
    assert call["truth_label"] == "LIVE_API"
    assert call["status"] == "live_succeeded"
    assert call["response"]["raw_response"] == (
        '{"success":true,"request_id":"req_demo",'
        '"transcript":"पानी धीरे आ रहा है"}'
    )
    assert secret not in response.text
    assert "RIFF-real-audio" not in response.text
