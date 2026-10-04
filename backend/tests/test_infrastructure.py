from concurrent.futures import ThreadPoolExecutor

import pytest
from alembic.autogenerate import compare_metadata
from alembic.config import Config
from alembic.migration import MigrationContext
from conftest import act, approve, detail
from fastapi.testclient import TestClient
from pydantic import ValidationError
from sqlalchemy import inspect, select, text

from alembic import command
from app.connectors.mock import ConnectorRegistry
from app.core.config import BACKEND_ROOT, Settings
from app.database.base import Base
from app.database.session import build_engine, migrate, session_factory
from app.main import create_app
from app.models import ActionReceipt, Approval, ConnectorCall, ServiceCase


@pytest.mark.parametrize("mode", ["live", "real", "external", "MOCK", "", "production"])
def test_real_modes_fail_closed(mode):
    with pytest.raises(ValidationError, match="unsupported"):
        Settings(connector_mode=mode)
    with pytest.raises(ValueError, match="unsupported"):
        ConnectorRegistry(mode)


@pytest.mark.parametrize(
    "origin",
    [
        "https://example.org",
        "*",
        "http://localhost:5173/path",
        "http://user:pass@localhost:5173",
        "http://localhost:5173?x=1",
    ],
)
def test_nonlocal_cors_config_rejected(origin):
    with pytest.raises(ValidationError):
        Settings(frontend_origin=origin)


def test_external_database_config_rejected():
    with pytest.raises(ValidationError):
        Settings(database_url="postgresql://localhost/demo")
    with pytest.raises(ValueError, match="under backend"):
        build_engine(Settings(database_url="sqlite:////tmp/ramukaka-forbidden.db"))


def test_all_adapters_are_mock_and_do_not_claim_external_effects(client):
    rails = client.get("/api/rails").json()
    assert {r["name"] for r in rails} == {
        "Gnani",
        "Pine Labs",
        "Delhivery",
        "WhatsApp",
        "Email",
        "AI",
    }
    assert all(
        r["mode"] == "mock" and r["truth_label"] == "DOCUMENTATION_SIMULATION" for r in rails
    )
    assert all(
        set(r) == {"name", "description", "mode", "truth_label", "operations"} for r in rails
    )
    for call in client.get("/api/connectors").json():
        assert call["truth_label"] == "DOCUMENTATION_SIMULATION"
        assert call["response"]["external_effect"] is False


def test_adapter_payload_allowlists_fail_closed():
    registry = ConnectorRegistry()
    for name, operation, payload in [
        (
            "AI",
            "classify",
            {"case_id": "RK-2048", "asset_id": "asset-kent-purifier", "api_key": "secret"},
        ),
        (
            "AI",
            "classify",
            {"case_id": "private email@example.org", "asset_id": "asset-kent-purifier"},
        ),
        ("AI", "real_inference", {}),
        ("Unknown", "notify", {}),
        ("WhatsApp", "share_sensitive", {"case_id": "RK-2048"}),
    ]:
        with pytest.raises(ValueError):
            registry.execute(name, operation, payload)
    payload = {"case_id": "RK-2048", "asset_id": "asset-kent-purifier"}
    assert registry.execute("AI", "classify", payload) == registry.execute(
        "AI", "classify", payload
    )


def test_alembic_schema_matches_models_and_downgrades(local_directory):
    settings = Settings(
        database_url="sqlite:///" + str(local_directory / "migration.db"), connector_mode="mock"
    )
    engine = build_engine(settings)
    try:
        migrate(engine)
        with engine.begin() as connection:
            assert (
                connection.scalar(text("SELECT version_num FROM alembic_version"))
                == "0005_service_schedules"
            )
            assert compare_metadata(MigrationContext.configure(connection), Base.metadata) == []
            assert connection.exec_driver_sql("PRAGMA foreign_keys").scalar() == 1
        config = Config(str(BACKEND_ROOT / "alembic.ini"))
        with engine.begin() as connection:
            config.attributes["connection"] = connection
            command.downgrade(config, "base")
        assert "cases" not in inspect(engine).get_table_names()
        migrate(engine)
        assert "cases" in inspect(engine).get_table_names()
    finally:
        engine.dispose()


def test_concurrent_payment_requests_create_exactly_one_receipt(local_directory):
    settings = Settings(
        database_url="sqlite:///" + str(local_directory / "concurrency.db"),
        connector_mode="mock",
        auto_migrate=True,
        auto_seed=True,
    )
    engine = build_engine(settings)
    try:
        with TestClient(create_app(settings, engine=engine)) as client:
            assert approve(client).status_code == 200
            with ThreadPoolExecutor(max_workers=4) as pool:
                responses = list(pool.map(lambda _: act(client, "payment"), range(4)))
            assert all(r.status_code == 200 for r in responses)
            with session_factory(engine)() as db:
                assert len(list(db.scalars(select(ActionReceipt)))) == 1
                assert (
                    len(
                        list(
                            db.scalars(
                                select(ConnectorCall).where(ConnectorCall.operation == "payment")
                            )
                        )
                    )
                    == 1
                )
    finally:
        engine.dispose()


def test_connector_failure_rolls_back_approval_and_all_partial_effects(
    client, sessions, monkeypatch
):
    approve(client)
    original = ConnectorRegistry.execute

    def fail_assignment(self, connector, operation, payload):
        if operation == "assign_provider":
            raise RuntimeError("Injected mock adapter failure")
        return original(self, connector, operation, payload)

    monkeypatch.setattr(ConnectorRegistry, "execute", fail_assignment)
    response = act(client, "payment")
    assert response.status_code == 503
    assert "Injected" not in response.text
    assert detail(client)["decisions"][-1]["rule"] == "ATOMIC_CONNECTOR_FAILURE"
    with sessions() as db:
        assert not db.get(ServiceCase, "RK-2048").assigned
        assert not db.scalar(select(Approval).where(Approval.kind == "spend")).consumed
        assert not list(
            db.scalars(select(ConnectorCall).where(ConnectorCall.operation == "payment"))
        )
        assert not list(db.scalars(select(ActionReceipt)))


def test_inactive_asset_rejected(client, sessions):
    from app.models import Asset

    with sessions() as db:
        db.get(Asset, "asset-kent-purifier").status = "retired"
        db.commit()
    assert (
        client.post(
            "/api/cases", json={"asset_id": "asset-kent-purifier", "complaint": "slow"}
        ).status_code
        == 409
    )


def test_reset_refuses_to_overwrite_non_demo_case(client, sessions):
    with sessions() as db:
        db.get(ServiceCase, "RK-2048").demo = False
        db.commit()
    before = detail(client)
    assert client.post("/api/simulation/reset").status_code == 409
    assert detail(client) == before
