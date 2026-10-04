from pathlib import Path
from urllib.parse import urlparse

from pydantic import AliasChoices, Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_ROOT = Path(__file__).resolve().parents[2]
REVIEWED_GEMINI_MODELS = {"gemini-3.8-flash", "gemini-3.5-flash"}


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="RK_", extra="ignore", populate_by_name=True)

    app_env: str = Field(
        default="development", validation_alias=AliasChoices("APP_ENV", "RK_APP_ENV")
    )
    database_url: str = Field(
        default=f"sqlite:///{BACKEND_ROOT / 'data' / 'ramukaka.db'}",
        validation_alias=AliasChoices("DATABASE_URL", "RK_DATABASE_URL"),
    )
    connector_mode: str = Field(
        default="mock", validation_alias=AliasChoices("CONNECTOR_MODE", "RK_CONNECTOR_MODE")
    )
    ai_provider: str = Field(
        default="mock", validation_alias=AliasChoices("AI_PROVIDER", "RK_AI_PROVIDER")
    )
    ai_api_key: SecretStr = Field(
        default=SecretStr(""),
        validation_alias=AliasChoices("GEMINI_API_KEY", "AI_API_KEY", "RK_AI_API_KEY"),
        repr=False,
        exclude=True,
    )
    ai_model: str = Field(
        default="gemini-3.8-flash",
        validation_alias=AliasChoices("AI_MODEL", "RK_AI_MODEL"),
    )
    ai_timeout_seconds: float = Field(default=45, ge=1, le=120)
    gnani_api_key: SecretStr = Field(
        default=SecretStr(""), validation_alias="GNANI_API_KEY", repr=False, exclude=True
    )
    gnani_live_enabled: bool = Field(
        default=False, validation_alias=AliasChoices("GNANI_LIVE_ENABLED", "RK_GNANI_LIVE_ENABLED")
    )
    gnani_stt_url: str = Field(
        default="https://api.vachana.ai/stt/v3",
        validation_alias=AliasChoices("GNANI_STT_URL", "RK_GNANI_STT_URL"),
    )
    gnani_timeout_seconds: float = Field(default=45, ge=1, le=120)
    pine_labs_api_key: SecretStr = Field(
        default=SecretStr(""), validation_alias="PINE_LABS_API_KEY", repr=False, exclude=True
    )
    delhivery_api_key: SecretStr = Field(
        default=SecretStr(""), validation_alias="DELHIVERY_API_KEY", repr=False, exclude=True
    )
    whatsapp_access_token: SecretStr = Field(
        default=SecretStr(""), validation_alias="WHATSAPP_ACCESS_TOKEN", repr=False, exclude=True
    )
    frontend_origin: str = "http://localhost:5173"
    auto_migrate: bool = True
    auto_seed: bool = True
    service_reminders_enabled: bool = True
    service_reminder_interval_seconds: float = Field(default=60, ge=0.01, le=86400)
    service_reminder_batch_size: int = Field(default=100, ge=1, le=1000)

    @field_validator("ai_provider")
    @classmethod
    def reviewed_model_only(cls, value: str) -> str:
        if value not in {"mock", "gemini"}:
            raise ValueError("Only mock and the reviewed Gemini adapter are supported")
        return value

    @field_validator("ai_model")
    @classmethod
    def reviewed_gemini_model(cls, value: str) -> str:
        if value not in REVIEWED_GEMINI_MODELS:
            raise ValueError("Use a reviewed stable Gemini Flash model")
        return value

    @field_validator("connector_mode")
    @classmethod
    def mock_only(cls, value: str) -> str:
        if value != "mock":
            raise ValueError(
                "Only mock connectors are implemented; external/real mode is unsupported"
            )
        return value

    @field_validator("database_url")
    @classmethod
    def sqlite_only(cls, value: str) -> str:
        if not value.startswith("sqlite:///"):
            raise ValueError("Only local SQLite is supported")
        return value

    @field_validator("frontend_origin")
    @classmethod
    def exact_frontend_origin(cls, value: str) -> str:
        parsed = urlparse(value)
        if parsed.port is not None and not 1 <= parsed.port <= 65535:
            raise ValueError("Frontend origin has an invalid port")
        if (
            parsed.scheme not in {"http", "https"}
            or not parsed.hostname
            or "*" in parsed.hostname
            or parsed.username
            or parsed.password
            or parsed.path
            or parsed.query
            or parsed.fragment
        ):
            raise ValueError("Frontend origin must be one exact HTTP(S) origin without a path")
        if parsed.scheme == "http" and parsed.hostname not in {"localhost", "127.0.0.1"}:
            raise ValueError("Non-local frontend origins must use HTTPS")
        return value

    @field_validator("gnani_stt_url")
    @classmethod
    def official_gnani_stt_url(cls, value: str) -> str:
        parsed = urlparse(value)
        if (
            parsed.scheme != "https"
            or parsed.hostname != "api.vachana.ai"
            or parsed.path != "/stt/v3"
            or parsed.username
            or parsed.password
            or parsed.query
            or parsed.fragment
        ):
            raise ValueError("Gnani STT URL must be the reviewed official /stt/v3 endpoint")
        return value
