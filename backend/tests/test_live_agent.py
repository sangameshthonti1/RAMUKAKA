import httpx
from pydantic import SecretStr

from app.agent import gemini


def test_agent_contract_fails_closed_without_live_configuration(client):
    response = client.get("/api/agent/contract")
    assert response.status_code == 200
    assert response.json() == {
        "provider": "mock",
        "model": "gemini-3.8-flash",
        "ready": False,
        "blocker": "Set AI_PROVIDER=gemini and add GEMINI_API_KEY in Render.",
    }
    attempt = client.post("/api/agent/RK-2048/decide", json={})
    assert attempt.status_code == 503
    assert "GEMINI_API_KEY" in attempt.json()["detail"]


def test_live_gemini_decision_is_allowlisted_logged_and_messaged(client, monkeypatch):
    secret = "gemini-test-key-never-log"
    settings = client.app.state.settings
    settings.ai_provider = "gemini"
    settings.ai_api_key = SecretStr(secret)

    class FakeClient:
        def __init__(self, **kwargs):
            assert kwargs["timeout"] == 45

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return None

        async def post(self, url, *, headers, json):
            assert url.endswith("/models/gemini-3.8-flash:generateContent")
            assert headers["x-goog-api-key"] == secret
            allowed = json["generationConfig"]["responseSchema"]["properties"]["action"]["enum"]
            assert allowed == ["request_household_approval", "escalate_human"]
            return httpx.Response(
                200,
                json={
                    "candidates": [
                        {
                            "content": {
                                "parts": [
                                    {
                                        "text": (
                                            '{"action":"request_household_approval",'
                                            '"reason":"The current quote still needs consent.",'
                                            '"message":"Please approve or reject the '
                                            '₹749 quote."}'
                                        )
                                    }
                                ]
                            }
                        }
                    ],
                    "usageMetadata": {"promptTokenCount": 100, "candidatesTokenCount": 30},
                },
                request=httpx.Request("POST", url),
            )

    monkeypatch.setattr(gemini.httpx, "AsyncClient", FakeClient)
    response = client.post("/api/agent/RK-2048/decide", json={})
    assert response.status_code == 201, response.text
    result = response.json()
    assert result["status"] == "live_succeeded"
    assert result["model"] == "gemini-3.8-flash"
    assert result["decision"]["action"] == "request_household_approval"
    assert result["decision"]["rule"] == "APPROVAL_REQUIRED"
    assert result["decision"]["truth_label"] == "LIVE_API"
    assert result["notification"]["channel"] == "in_app:household"
    assert result["notification"]["message"] == "Please approve or reject the ₹749 quote."
    assert result["connector_call"]["truth_label"] == "LIVE_API"
    assert result["connector_call"]["status"] == "live_succeeded"
    assert secret not in response.text
    assert "Low water flow" not in str(result["connector_call"]["request"])


def test_invalid_model_output_creates_no_decision_or_message(client, monkeypatch):
    settings = client.app.state.settings
    settings.ai_provider = "gemini"
    settings.ai_api_key = SecretStr("test-key")

    class FakeClient:
        def __init__(self, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return None

        async def post(self, url, *, headers, json):
            return httpx.Response(
                200,
                json={"candidates": [{"content": {"parts": [{"text": "not-json"}]}}]},
                request=httpx.Request("POST", url),
            )

    monkeypatch.setattr(gemini.httpx, "AsyncClient", FakeClient)
    response = client.post("/api/agent/RK-2048/decide", json={})
    assert response.status_code == 201
    result = response.json()
    assert result["status"] == "live_failed"
    assert result["decision"] is None
    assert result["notification"] is None
