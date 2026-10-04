import os
from pathlib import Path
from tempfile import TemporaryDirectory

import pytest
from fastapi.testclient import TestClient

from app.core.config import BACKEND_ROOT, Settings
from app.database.session import build_engine

# Never enable outbound integration through an inherited developer environment.
os.environ["RK_CONNECTOR_MODE"] = "mock"

from app.main import create_app  # noqa: E402 -- set mode before default app creation


@pytest.fixture
def settings():
    return Settings(
        database_url="sqlite:///:memory:",
        connector_mode="mock",
        frontend_origin="http://localhost:5173",
        auto_migrate=True,
        auto_seed=True,
    )


@pytest.fixture
def client(settings):
    engine = build_engine(settings)
    app = create_app(settings, engine=engine)
    try:
        with TestClient(app) as test_client:
            yield test_client
    finally:
        engine.dispose()


@pytest.fixture
def sessions(client):
    return client.app.state.session_factory


@pytest.fixture
def local_directory():
    # The parent's test invocation need not grant any writes outside backend.
    root = BACKEND_ROOT / "data"
    root.mkdir(exist_ok=True)
    with TemporaryDirectory(prefix="test-", dir=root) as directory:
        yield Path(directory)


def progress(client, steps):
    for _ in range(steps):
        response = client.post("/api/simulation/next")
        assert response.status_code == 200, response.text


def detail(client, case_id="RK-2048"):
    response = client.get("/api/cases/" + case_id)
    assert response.status_code == 200
    return response.json()


def approve(client, kind="spend", case_id="RK-2048"):
    return client.post(
        f"/api/cases/{case_id}/approvals", json={"kind": kind, "decision": "approved"}
    )


def act(client, action, case_id="RK-2048"):
    return client.post(f"/api/cases/{case_id}/actions", json={"action": action})


def confirm(client, party, confirmed=True, case_id="RK-2048"):
    return client.post(
        f"/api/cases/{case_id}/{party}-confirmation",
        json={"confirmed": confirmed, "note": "Local test confirmation"},
    )
