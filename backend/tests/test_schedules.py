import asyncio
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import date, timedelta

import pytest
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import func, select, text

from alembic import command
from app import models as m
from app.core.config import BACKEND_ROOT, Settings
from app.core.types import utcnow
from app.database.session import build_engine, migrate, session_factory
from app.main import create_app
from app.seed.demo import DEMO_ASSET_ID, DEMO_HOUSEHOLD_ID, seed_demo
from app.services import schedules
from app.services.intake import DEMO_PROVIDER_ID

HOUSEHOLD = {"X-Demo-Role": "household"}
PROVIDER = {"X-Demo-Role": "provider", "X-Provider-ID": DEMO_PROVIDER_ID}
TODAY = date(2030, 1, 10)
DUE = TODAY + timedelta(days=7)


def create(client, headers=HOUSEHOLD, **changes):
    body = {
        "household_id": DEMO_HOUSEHOLD_ID,
        "asset_id": DEMO_ASSET_ID,
        "provider_id": DEMO_PROVIDER_ID,
        "next_service_on": DUE.isoformat(),
    }
    body.update(changes)
    return client.post("/api/service-schedules", headers=headers, json=body)


def saved(client, **changes):
    response = create(client, **changes)
    assert response.status_code == 201, response.text
    return response.json()


def check(client, as_of=TODAY):
    response = client.post("/api/service-reminders/check", json={"as_of": as_of.isoformat()})
    assert response.status_code == 200, response.text
    return response.json()


def reminders(client, audience="household", history=False):
    owner = DEMO_HOUSEHOLD_ID if audience == "household" else DEMO_PROVIDER_ID
    response = client.get(
        f"/api/{audience}s/{owner}/service-reminders", params={"include_history": history}
    )
    assert response.status_code == 200, response.text
    return response.json()


def edit(client, schedule, headers=HOUSEHOLD, **changes):
    return client.patch(
        f"/api/service-schedules/{schedule['id']}",
        headers=headers,
        json={"expected_revision": schedule["revision"], **changes},
    )


@pytest.mark.parametrize("headers", [HOUSEHOLD, PROVIDER])
def test_create_list_and_mirror(client, sessions, headers):
    response = create(client, headers, note="Annual filter service")
    assert response.status_code == 201, response.text
    record = response.json()
    assert record["created_by"] == headers["X-Demo-Role"]
    assert record["updated_by"] == record["created_by"]
    assert record["revision"] == 1 and record["status"] == "active"
    assert client.get(f"/api/service-schedules/{record['id']}").json() == record
    for audience, owner in (("household", DEMO_HOUSEHOLD_ID), ("provider", DEMO_PROVIDER_ID)):
        response = client.get(f"/api/{audience}s/{owner}/service-schedules")
        assert response.json() == [record]
        assert (
            client.get(f"/api/{audience}s/{owner}/service-schedules?status=cancelled").json() == []
        )
    with sessions() as db:
        assert db.get(m.Asset, DEMO_ASSET_ID).next_service_on == DUE
    assert create(client).status_code == 409


@pytest.mark.parametrize(
    "headers",
    [
        {},
        {"X-Demo-Role": "customer"},
        {"X-Demo-Role": "provider"},
        {"X-Demo-Role": "provider", "X-Provider-ID": "provider-aqua-care"},
    ],
)
def test_create_requires_matching_local_attribution(client, headers):
    assert create(client, headers).status_code == 403
    assert client.get(f"/api/households/{DEMO_HOUSEHOLD_ID}/service-schedules").json() == []


def test_provider_can_infer_assigned_case_or_asset(client, sessions):
    with sessions() as db:
        db.get(m.ServiceCase, "RK-2048").assigned = True
        db.commit()
    response = create(client, {"X-Demo-Role": "provider"}, provider_id=None, case_id="RK-2048")
    assert response.status_code == 201, response.text
    record = response.json()
    assert record["provider_id"] == DEMO_PROVIDER_ID and record["case_id"] == "RK-2048"
    assert edit(client, record, {"X-Demo-Role": "provider"}, note="Updated").status_code == 200
    # A simulation reset unlinks its deleted case, without deleting the schedule.
    assert client.post("/api/simulation/reset").status_code == 200
    assert client.get(f"/api/service-schedules/{record['id']}").json()["case_id"] is None


def test_provider_can_infer_assignment_for_asset_without_case(client, sessions):
    with sessions() as db:
        db.get(m.ServiceCase, "RK-2048").assigned = True
        db.commit()
    assert create(client, {"X-Demo-Role": "provider"}, provider_id=None).status_code == 201


@pytest.mark.parametrize(
    "changes, expected",
    [
        ({"household_id": "missing"}, 404),
        ({"asset_id": "missing"}, 404),
        ({"provider_id": "missing"}, 404),
        ({"case_id": "missing"}, 404),
        ({"case_id": "RK-2048"}, 409),
        ({"provider_id": None}, 422),
        ({"next_service_on": "not-a-date"}, 422),
        ({"note": "x" * 2001}, 422),
        ({"outbound_sms": True}, 422),
    ],
)
def test_create_validation(client, changes, expected):
    assert create(client, **changes).status_code == expected


def test_mismatched_household_case_provider_and_retired_asset(client, sessions):
    home = client.post(
        "/api/households", headers=HOUSEHOLD, json={"name": "Other", "member_name": "Member"}
    ).json()
    assert create(client, household_id=home["id"]).status_code == 409
    with sessions() as db:
        db.get(m.ServiceCase, "RK-2048").assigned = True
        db.commit()
    assert create(client, case_id="RK-2048", provider_id="provider-aqua-care").status_code == 409
    with sessions() as db:
        db.get(m.Asset, DEMO_ASSET_ID).status = "retired"
        db.commit()
    assert create(client).status_code == 409


def test_upcoming_and_due_are_persisted_for_both_audiences_once(client, sessions):
    with sessions() as db:
        connector_count = db.scalar(select(func.count()).select_from(m.ConnectorCall))
    saved(client)
    assert check(client, TODAY - timedelta(days=1))["reminders_created"] == 0
    result = check(client)
    assert result["reminders_created"] == 2 and result["schedules_processed"] == 1
    assert result["external_effect"] is False
    for audience in ("household", "provider"):
        records = reminders(client, audience)
        assert len(records) == 1
        assert records[0]["stage"] == "upcoming" and records[0]["audience"] == audience
        assert records[0]["channel"] == "in_app" and records[0]["external_effect"] is False
        assert records[0]["status"] == "available"
        assert "no SMS or call was sent" in records[0]["message"]
    assert check(client)["reminders_created"] == 0
    assert check(client, DUE)["reminders_created"] == 2
    assert check(client, DUE + timedelta(days=90))["reminders_created"] == 0
    with sessions() as db:
        assert db.scalar(select(func.count()).select_from(m.ServiceReminder)) == 4
        assert db.scalar(select(func.count()).select_from(m.ConnectorCall)) == connector_count


def test_overdue_skips_obsolete_upcoming_notification(client):
    saved(client, next_service_on=(TODAY - timedelta(days=1)).isoformat())
    assert check(client)["reminders_created"] == 2
    assert reminders(client)[0]["stage"] == "due"


def test_reschedule_note_noop_stale_revision_cancel_and_reactivate(client, sessions):
    record = saved(client)
    check(client)
    old_id = reminders(client)[0]["id"]
    result = edit(client, record, note="Changed note")
    assert result.status_code == 200 and result.json()["revision"] == 1
    assert edit(client, record, next_service_on=DUE.isoformat()).json()["revision"] == 1
    assert check(client)["reminders_created"] == 0
    result = edit(client, record, PROVIDER, next_service_on=(DUE + timedelta(days=2)).isoformat())
    assert result.status_code == 200, result.text
    revised = result.json()
    assert revised["revision"] == 2 and revised["updated_by"] == "provider"
    assert reminders(client) == []
    assert reminders(client, history=True)[0]["status"] == "superseded"
    assert edit(client, record, status="cancelled").status_code == 409
    assert (
        client.post(f"/api/service-reminders/{old_id}/acknowledge", headers=HOUSEHOLD).status_code
        == 409
    )
    assert check(client, TODAY + timedelta(days=2))["reminders_created"] == 2
    response = edit(client, revised, status="cancelled")
    assert response.status_code == 200
    cancelled = response.json()
    assert check(client, DUE + timedelta(days=2))["reminders_created"] == 0
    assert reminders(client) == []
    with sessions() as db:
        assert db.get(m.Asset, DEMO_ASSET_ID).next_service_on is None
    assert edit(client, cancelled, status="active").json()["revision"] == 4
    assert check(client, DUE + timedelta(days=2))["reminders_created"] == 2


def test_asset_mirror_does_not_clobber_independent_date(client, sessions):
    record = saved(client)
    independent = DUE + timedelta(days=30)
    with sessions() as db:
        db.get(m.Asset, DEMO_ASSET_ID).next_service_on = independent
        db.commit()
    assert edit(client, record, status="cancelled").status_code == 200
    with sessions() as db:
        assert db.get(m.Asset, DEMO_ASSET_ID).next_service_on == independent


@pytest.mark.parametrize(
    "body",
    [
        {"expected_revision": 1},
        {"expected_revision": 1, "next_service_on": None},
        {"expected_revision": 1, "status": "done"},
        {"expected_revision": 0, "note": "x"},
    ],
)
def test_patch_validation(client, body):
    record = saved(client)
    assert (
        client.patch(
            f"/api/service-schedules/{record['id']}", headers=HOUSEHOLD, json=body
        ).status_code
        == 422
    )


def test_acknowledge_is_audience_scoped_and_idempotent(client):
    saved(client)
    check(client)
    record = reminders(client)[0]
    url = f"/api/service-reminders/{record['id']}/acknowledge"
    assert client.post(url, headers=PROVIDER).status_code == 403
    assert client.post(url).status_code == 403
    first = client.post(url, headers=HOUSEHOLD).json()
    assert first["status"] == "acknowledged" and first["acknowledged_at"]
    assert client.post(url, headers=HOUSEHOLD).json() == first
    assert check(client)["reminders_created"] == 0


@pytest.mark.parametrize("kind", ["local_message", "contact_note"])
def test_provider_contact_saved_locally_without_outbound_claim(client, sessions, kind):
    record = saved(client)
    check(client)
    url = f"/api/service-schedules/{record['id']}/contacts"
    body = {"expected_revision": 1, "kind": kind, "content": "Please arrange a service time."}
    assert client.post(url, headers=HOUSEHOLD, json=body).status_code == 403
    wrong = {"X-Demo-Role": "provider", "X-Provider-ID": "provider-aqua-care"}
    assert client.post(url, headers=wrong, json=body).status_code == 403
    response = client.post(url, headers=PROVIDER, json=body)
    assert response.status_code == 201, response.text
    contact = response.json()
    assert contact["content"] == body["content"] and contact["kind"] == kind
    assert contact["external_effect"] is False and contact["status"] == "local_recorded"
    assert client.get(url).json() == [contact]
    assert reminders(client, "provider")[0]["status"] == "acknowledged"
    assert reminders(client)[0]["status"] == "available"
    assert check(client)["reminders_created"] == 0
    assert (
        client.post(url, headers=PROVIDER, json={**body, "expected_revision": 2}).status_code == 409
    )
    assert edit(client, record, status="cancelled").status_code == 200
    assert (
        client.post(url, headers=PROVIDER, json={**body, "expected_revision": 2}).status_code == 409
    )
    assert client.get(url).json() == [contact]
    with sessions() as db:
        assert db.scalar(select(func.count()).select_from(m.ServiceContact)) == 1


def test_retired_asset_suppresses_processing_and_current_reminder_list(client, sessions):
    saved(client)
    check(client)
    with sessions() as db:
        db.get(m.Asset, DEMO_ASSET_ID).status = "retired"
        db.commit()
    assert check(client, DUE)["reminders_created"] == 0
    assert reminders(client) == []
    assert len(reminders(client, history=True)) == 1


def test_batch_is_bounded_without_starving_later_schedules(client, sessions):
    saved(client)
    with sessions() as db:
        for i in range(3):
            asset = m.Asset(
                household_id=DEMO_HOUSEHOLD_ID,
                name=f"Asset {i}",
                brand="",
                model="",
                location="Home",
                installed_on=date(2024, 1, 1),
                notes="",
            )
            db.add(asset)
            db.flush()
            db.add(
                m.ServiceSchedule(
                    asset_id=asset.id,
                    household_id=DEMO_HOUSEHOLD_ID,
                    provider_id=DEMO_PROVIDER_ID,
                    next_service_on=DUE,
                    created_by="household",
                    updated_by="household",
                )
            )
        db.commit()
        for _ in range(4):
            result = schedules.process_due(db, TODAY, batch_limit=1)
            assert result["schedules_processed"] == 1 and result["reminders_created"] == 2
            db.commit()
        assert schedules.process_due(db, TODAY, batch_limit=1)["schedules_processed"] == 0


def test_check_accepts_max_date_without_overflow(client):
    saved(client)
    assert check(client, date.max)["reminders_created"] == 2


def test_provider_edit_and_acknowledgement_require_matching_attribution(client):
    record = saved(client)
    check(client)
    wrong = {"X-Demo-Role": "provider", "X-Provider-ID": "provider-aqua-care"}
    assert edit(client, record, wrong, note="Wrong company").status_code == 403
    assert edit(client, record, {}, note="Missing attribution").status_code == 403
    reminder = reminders(client, "provider")[0]
    path = f"/api/service-reminders/{reminder['id']}/acknowledge"
    assert client.post(path, headers=wrong).status_code == 403
    assert client.post(path, headers=PROVIDER).json()["status"] == "acknowledged"


def test_cancelled_case_is_not_provider_attribution(client, sessions):
    with sessions() as db:
        case = db.get(m.ServiceCase, "RK-2048")
        case.assigned = True
        db.commit()
    record = saved(client, case_id="RK-2048")
    with sessions() as db:
        db.get(m.ServiceCase, "RK-2048").status = "cancelled"
        db.commit()
    assert (
        edit(client, record, {"X-Demo-Role": "provider"}, note="No attribution").status_code == 403
    )
    assert edit(client, record, PROVIDER, note="Explicit local attribution").status_code == 200


def test_cors_allows_explicit_provider_attribution(client):
    response = client.options(
        "/api/service-schedules",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "X-Demo-Role,X-Provider-ID,Content-Type",
        },
    )
    assert response.status_code == 200
    assert "X-Provider-ID" in response.headers["access-control-allow-headers"]


def test_default_check_uses_utc_date_and_pagination(client):
    saved(client, next_service_on=utcnow().date().isoformat())
    response = client.post("/api/service-reminders/check", json={})
    assert response.json()["as_of"] == utcnow().date().isoformat()
    assert response.json()["reminders_created"] == 2
    path = f"/api/households/{DEMO_HOUSEHOLD_ID}/service-reminders"
    assert len(client.get(path + "?limit=1").json()) == 1
    assert client.get(path + "?offset=1").json() == []
    assert client.get(path + "?limit=0").status_code == 422
    assert client.get("/api/providers/missing/service-reminders").status_code == 404
    assert client.get("/api/service-schedules/missing").status_code == 404


def test_concurrent_checks_are_idempotent_on_file_sqlite(local_directory):
    settings = Settings(
        database_url=f"sqlite:///{local_directory / 'concurrent.db'}",
        service_reminders_enabled=False,
    )
    engine = build_engine(settings)
    try:
        with TestClient(create_app(settings, engine=engine)) as client:
            saved(client)
            with ThreadPoolExecutor(max_workers=4) as pool:
                results = list(pool.map(lambda _: check(client), range(4)))
            assert sum(result["reminders_created"] for result in results) == 2
            assert len(reminders(client)) == len(reminders(client, "provider")) == 1
    finally:
        engine.dispose()


def test_periodic_worker_startup_restart_and_shutdown(local_directory):
    settings = Settings(
        database_url=f"sqlite:///{local_directory / 'worker.db'}",
        service_reminder_interval_seconds=0.02,
    )
    engine = build_engine(settings)
    try:
        application = create_app(settings, engine=engine)
        with TestClient(application) as client:
            saved(client, next_service_on=utcnow().date().isoformat())
            deadline = time.monotonic() + 3
            count = 0
            while time.monotonic() < deadline:
                with session_factory(engine)() as db:
                    count = db.scalar(select(func.count()).select_from(m.ServiceReminder))
                if count == 2:
                    break
                time.sleep(0.03)
            assert count == 2
            task = application.state.service_reminder_task
            assert not task.done()
        assert task.done() and not task.cancelled()
        # A persisted schedule produces no duplicate reminders across process restarts.
        with TestClient(create_app(settings, engine=engine)) as client:
            assert len(reminders(client)) == 1
            assert check(client, utcnow().date())["reminders_created"] == 0
    finally:
        engine.dispose()


def test_startup_processes_persisted_due_schedule(local_directory):
    settings = Settings(database_url=f"sqlite:///{local_directory / 'startup.db'}")
    engine = build_engine(settings)
    try:
        migrate(engine)
        with session_factory(engine)() as db:
            seed_demo(db)
            db.add(
                m.ServiceSchedule(
                    asset_id=DEMO_ASSET_ID,
                    household_id=DEMO_HOUSEHOLD_ID,
                    provider_id=DEMO_PROVIDER_ID,
                    next_service_on=utcnow().date(),
                    created_by="household",
                    updated_by="household",
                )
            )
            db.commit()
        with TestClient(create_app(settings, engine=engine)) as client:
            assert len(reminders(client)) == len(reminders(client, "provider")) == 1
    finally:
        engine.dispose()


def test_worker_disabled(settings):
    settings.service_reminders_enabled = False
    application = create_app(settings)
    with TestClient(application) as client:
        assert application.state.service_reminder_task is None
        saved(client, next_service_on=utcnow().date().isoformat())
        assert reminders(client) == []
        assert check(client, utcnow().date())["reminders_created"] == 2


def test_worker_retries_failed_tick_and_stops(monkeypatch):
    calls = []

    async def run():
        stop = asyncio.Event()

        def fake_check(factory, batch_limit):
            calls.append(batch_limit)
            if len(calls) == 1:
                raise RuntimeError("Transient local failure")

        monkeypatch.setattr(schedules, "run_check", fake_check)
        task = asyncio.create_task(
            schedules.reminder_worker(None, stop, interval=0.01, batch_limit=2)
        )
        async with asyncio.timeout(2):
            while len(calls) < 2:
                await asyncio.sleep(0.01)
            stop.set()
            await task
        assert task.done()

    asyncio.run(run())
    assert calls[:2] == [2, 2]


def test_0005_upgrades_existing_0004_data_without_seed_or_production_db(local_directory):
    engine = build_engine(Settings(database_url=f"sqlite:///{local_directory / 'upgrade.db'}"))
    config = Config(str(BACKEND_ROOT / "alembic.ini"))
    try:
        with engine.begin() as connection:
            config.attributes["connection"] = connection
            command.upgrade(config, "0004_local_coordination")
        with session_factory(engine)() as db:
            seed_demo(db)
            db.commit()
        migrate(engine)
        with engine.begin() as connection:
            assert (
                connection.scalar(text("SELECT version_num FROM alembic_version"))
                == "0005_service_schedules"
            )
        with session_factory(engine)() as db:
            asset = db.get(m.Asset, DEMO_ASSET_ID)
            assert asset is not None and asset.name == "Kent water purifier"
            assert db.get(m.ServiceCase, "RK-2048")
            assert db.scalar(select(func.count()).select_from(m.ServiceSchedule)) == 0
    finally:
        engine.dispose()
