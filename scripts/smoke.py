"""Bounded real-server checks; all state/artifacts stay inside this project."""

import argparse
import json
import os
import shutil
import signal
import socket
import subprocess
import sys
import tempfile
import time
from contextlib import ExitStack
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
API = "http://127.0.0.1:8000"
WEB = "http://127.0.0.1:5173"


def request(path, body=None, expected=200, *, base=None):
    encoded = json.dumps(body).encode() if body is not None else None
    req = Request(
        (base or API) + path, data=encoded, headers={"Content-Type": "application/json"}
    )
    try:
        with urlopen(req, timeout=5) as response:
            status, raw = response.status, response.read()
    except HTTPError as exc:
        status, raw = exc.code, exc.read()
    assert status == expected, (path, status, raw.decode()[:400])
    return json.loads(raw)


def wait_ready(url, process):
    for _ in range(100):
        if process.poll() is not None:
            raise RuntimeError(f"Server exited: {url}; see artifacts/*-smoke.log")
        try:
            with urlopen(url, timeout=1) as response:
                if response.status == 200:
                    return
        except (OSError, URLError):
            pass
        time.sleep(0.1)
    raise TimeoutError(f"Server did not become ready: {url}")


def stop(process):
    if process.poll() is None:
        if os.name == "posix":
            os.killpg(process.pid, signal.SIGTERM)
        else:
            process.terminate()
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            if os.name == "posix":
                os.killpg(process.pid, signal.SIGKILL)
            else:
                process.kill()
            process.wait(timeout=5)


def assert_free(port):
    with socket.socket() as sock:
        try:
            sock.bind(("127.0.0.1", port))
        except OSError as exc:
            raise RuntimeError(
                f"Port {port} is occupied; stop your own server first"
            ) from exc


def api_checks():
    assert request("/health")["connector_mode"] == "mock"
    assert request("/health", base=WEB)["status"] == "ok"
    original = request("/api/cases/RK-2048")
    assert original["status"] == "waiting_for_approval"
    assert original["quote_amount"] == 749
    assert len(original["events"]) == 6
    assert any("Filter replacement" in event["detail"] for event in original["events"])
    for action in ("payment", "share_sensitive", "change_provider"):
        request("/api/cases/RK-2048/actions", {"action": action}, 403)
    request("/api/cases/RK-2048/approvals", {"kind": "spend", "decision": "rejected"})
    request("/api/simulation/next", {}, 409)
    request("/api/simulation/reset", {})
    for step in range(1, 7):
        progress = request("/api/simulation/next", {})
        assert progress["step"] == step
        detail = request("/api/cases/RK-2048")
        assert len(detail["events"]) == 6 + step
        assert (detail["status"] == "closed") == (step == 6)
    calls = request("/api/connectors")
    assert calls and all(
        call["truth_label"] == "DOCUMENTATION_SIMULATION" for call in calls
    )
    for first, second in (("provider", "household"), ("household", "provider")):
        request("/api/simulation/reset", {})
        for _ in range(3):
            request("/api/simulation/next", {})
        detail = request(
            f"/api/cases/RK-2048/{first}-confirmation",
            {"confirmed": True, "note": "Local smoke assessment"},
        )
        assert detail["status"] != "closed"
        detail = request(
            f"/api/cases/RK-2048/{second}-confirmation",
            {"confirmed": True, "note": "Local smoke assessment"},
        )
        assert detail["status"] == "closed"
        detail = request(
            f"/api/cases/RK-2048/{second}-confirmation",
            {"confirmed": False, "note": "Still unresolved in smoke test"},
        )
        assert detail["status"] == "reopened"
    request(
        "/api/signup",
        {"name": "Smoke demo", "email": "smoke@example.test", "consent": True},
        201,
    )
    request("/api/simulation/reset", {})
    assert request("/api/cases/RK-2048") == original
    request(
        "/api/signup",
        {"name": "Smoke demo", "email": "smoke@example.test", "consent": True},
        409,
    )
    schema = request("/openapi.json")
    assert "/api/cases/{case_id}/approvals" in schema["paths"]
    (ROOT / "shared/schemas/openapi.json").write_text(
        json.dumps(schema, indent=2) + "\n"
    )
    with urlopen(WEB, timeout=5) as response:
        assert b'id="root"' in response.read()
    print(
        "PASS: health, frontend HTML/proxy, spend/share/provider guards, rejection, six events, both closure orders, unresolved reopen, truth labels, scoped reset, signup and OpenAPI"
    )


def main():
    global API, WEB
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--browser",
        action="store_true",
        help="Also run installed project-local Chromium",
    )
    parser.add_argument("--backend-port", type=int, default=8000)
    parser.add_argument("--frontend-port", type=int, default=5173)
    args = parser.parse_args()
    API = f"http://127.0.0.1:{args.backend_port}"
    WEB = f"http://127.0.0.1:{args.frontend_port}"
    if args.backend_port == args.frontend_port or not all(
        1 <= port <= 65535 for port in (args.backend_port, args.frontend_port)
    ):
        parser.error("Use two distinct ports from 1 to 65535")
    for port in (args.backend_port, args.frontend_port):
        assert_free(port)
    artifacts = ROOT / "artifacts"
    artifacts.mkdir(exist_ok=True)
    (ROOT / "backend/data").mkdir(exist_ok=True)
    npm = shutil.which("npm")
    if not npm:
        raise RuntimeError("npm is required")
    with ExitStack() as stack:
        db_dir = Path(
            stack.enter_context(
                tempfile.TemporaryDirectory(prefix="smoke-", dir=ROOT / "backend/data")
            )
        )
        tmp_dir = stack.enter_context(
            tempfile.TemporaryDirectory(prefix="browser-", dir=artifacts)
        )
        env = dict(
            os.environ,
            DATABASE_URL=f"sqlite:///{db_dir / 'smoke.db'}",
            CONNECTOR_MODE="mock",
            AI_PROVIDER="mock",
            PYTHONDONTWRITEBYTECODE="1",
            RK_AUTO_MIGRATE="true",
            RK_AUTO_SEED="true",
            # Exercise automatic reminder delivery quickly against the isolated test DB.
            RK_SERVICE_REMINDER_INTERVAL_SECONDS="1",
            RK_BACKEND_PORT=str(args.backend_port),
            RK_FRONTEND_PORT=str(args.frontend_port),
            RK_WEB_URL=WEB,
            TMPDIR=tmp_dir,
        )
        backend_log = stack.enter_context((artifacts / "backend-smoke.log").open("w"))
        frontend_log = stack.enter_context((artifacts / "frontend-smoke.log").open("w"))
        backend = subprocess.Popen(
            [
                sys.executable,
                "-m",
                "uvicorn",
                "app.main:app",
                "--host",
                "127.0.0.1",
                "--port",
                str(args.backend_port),
            ],
            cwd=ROOT / "backend",
            env=env,
            stdout=backend_log,
            stderr=subprocess.STDOUT,
            start_new_session=True,
        )
        stack.callback(stop, backend)
        frontend = subprocess.Popen(
            [npm, "run", "dev"],
            cwd=ROOT / "frontend",
            env=env,
            stdout=frontend_log,
            stderr=subprocess.STDOUT,
            start_new_session=True,
        )
        stack.callback(stop, frontend)
        wait_ready(API + "/health", backend)
        wait_ready(WEB, frontend)
        api_checks()
        if args.browser:
            browser_env = dict(
                env,
                PLAYWRIGHT_BROWSERS_PATH=str(ROOT / "frontend/.browsers"),
                RK_ARTIFACT_DIR=str(artifacts),
            )
            subprocess.run(
                ["node", "e2e/smoke.mjs"],
                cwd=ROOT / "frontend",
                env=browser_env,
                check=True,
                timeout=120,
            )
            subprocess.run(
                ["node", "e2e/workspace.mjs"],
                cwd=ROOT / "frontend",
                env=browser_env,
                check=True,
                timeout=120,
            )
    print(
        "PASS: subprocesses stopped; temporary database removed; normal demo database untouched"
    )


if __name__ == "__main__":
    main()
