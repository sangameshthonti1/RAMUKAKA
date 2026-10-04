import pytest
from pydantic import ValidationError

from app.agent.providers import model_provider
from app.core.config import Settings


def test_canonical_environment_variables(monkeypatch):
    monkeypatch.setenv("APP_ENV", "test")
    monkeypatch.setenv("DATABASE_URL", "sqlite:///:memory:")
    monkeypatch.setenv("CONNECTOR_MODE", "mock")
    monkeypatch.setenv("AI_PROVIDER", "mock")
    settings = Settings()
    assert settings.app_env == "test"
    assert settings.database_url == "sqlite:///:memory:"
    assert settings.connector_mode == settings.ai_provider == "mock"


def test_legacy_environment_aliases(monkeypatch):
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.setenv("RK_DATABASE_URL", "sqlite:///:memory:")
    assert Settings().database_url == "sqlite:///:memory:"


def test_canonical_mode_cannot_silently_fall_back(monkeypatch):
    monkeypatch.setenv("CONNECTOR_MODE", "live")
    with pytest.raises(ValidationError, match="unsupported"):
        Settings()


@pytest.mark.parametrize("name", ["claude", "openai"])
def test_unreviewed_models_fail_closed(name, monkeypatch):
    monkeypatch.setenv("AI_PROVIDER", name)
    with pytest.raises(ValidationError, match="reviewed Gemini"):
        Settings()
    with pytest.raises(ValueError, match="proposed capabilities"):
        model_provider(name)


def test_reviewed_gemini_configuration_requires_exact_model():
    settings = Settings(ai_provider="gemini", ai_model="gemini-3.8-flash")
    assert settings.ai_provider == "gemini"
    with pytest.raises(ValidationError, match="reviewed stable"):
        Settings(ai_provider="gemini", ai_model="gemini-experimental")


def test_credentials_excluded_from_serialization_and_repr(monkeypatch):
    for key in (
        "AI_API_KEY",
        "GNANI_API_KEY",
        "PINE_LABS_API_KEY",
        "DELHIVERY_API_KEY",
        "WHATSAPP_ACCESS_TOKEN",
    ):
        monkeypatch.setenv(key, "test-only-sentinel")
    settings = Settings()
    assert "test-only-sentinel" not in repr(settings)
    assert "test-only-sentinel" not in settings.model_dump_json()
    assert "api_key" not in settings.model_dump_json()


def test_mock_model_requires_no_key():
    result = model_provider().classify(case_id="RK-2048", asset_id="asset-kent-purifier")
    assert result.category == "water_purifier_service"
    assert result.urgency == "routine"
