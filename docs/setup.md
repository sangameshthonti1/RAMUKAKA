# Setup and environment

## Local prerequisites

Use Python 3.12, Node 22.12+ (24 LTS recommended), and npm. The current workspace was validated with a Python 3.12 runtime installed under `backend/.python` and `.venv`; no system runtime was installed. These generated runtime folders and caches are ignored and are not part of source distribution. Another machine should create its own virtual environment using the README instructions.

`requirements.txt` expresses supported ranges; `requirements.lock.txt` captures the versions used for validation. Install the lock for reproducibility. `package-lock.json` similarly locks frontend dependencies. Keep downloads inside `.pip-cache`/`.npm-cache` when installing locally.

## Configuration table

| Variable                | Default / purpose                                                |
| ----------------------- | ---------------------------------------------------------------- |
| `APP_ENV`               | `development`; deployment metadata, not an authentication switch |
| `DATABASE_URL`          | Absolute local SQLite URL ending in `backend/data/ramukaka.db`   |
| `CONNECTOR_MODE`        | `mock` only; any other value rejects startup                     |
| `AI_PROVIDER`           | `mock` only; Gemini/Claude/OpenAI adapters are future extensions |
| `AI_API_KEY`            | Empty, backend-only reserved secret                              |
| `GNANI_API_KEY`         | Empty; required only for the explicit live Gnani STT console     |
| `GNANI_LIVE_ENABLED`    | `false`; must be `true` to permit the reviewed Gnani endpoint    |
| `GNANI_STT_URL`         | Reviewed `https://api.vachana.ai/stt/v3`; other URLs are rejected |
| `PINE_LABS_API_KEY`     | Empty, reserved                                                  |
| `DELHIVERY_API_KEY`     | Empty, reserved                                                  |
| `WHATSAPP_ACCESS_TOKEN` | Empty, reserved                                                  |
| `RK_FRONTEND_ORIGIN`    | `http://localhost:5173`; exact local HTTP or deployed HTTPS origin |
| `RK_AUTO_MIGRATE`       | `true`; startup applies migrations                               |
| `RK_AUTO_SEED`          | `true`; startup seeds when demo is missing                       |

Canonical `DATABASE_URL`/`CONNECTOR_MODE` override their old `RK_` aliases. Secrets are `SecretStr`, excluded from representation and serialization, and are never sent to the frontend. Default rehearsal needs no key. A live Gnani demonstration requires a local, untracked `.env`; never paste the key into source, screenshots, logs or commits.

Settings intentionally do not implicitly read `.env`. Uvicorn can explicitly load `.env.example` with `--env-file ../.env.example` from backend. Alembic/seed CLI use exported variables, so export the same `DATABASE_URL` for all three processes if overriding it. Relative SQLite paths resolve under `backend/` regardless of working directory; outside paths are rejected.

## Migration, backup and seed

Before upgrading an existing SQLite file, from the root run `backend/.venv/bin/python scripts/backup_db.py`. The snapshot is verified with SQLite's integrity check and saved under ignored `backend/data/backups/`; the backup tool honors an explicitly set `DATABASE_URL`. Migration `0002_working_model` added inventory provenance and manual service-plan fields; `0003_service_chat` adds nullable asset purchase/warranty-expiry/next-service dates and serial number plus persisted conversation/message tables. The upgrade does not reset existing cases. Do not run a schema downgrade on your only copy. To restore, stop both servers, preserve the current file separately and replace it with a verified snapshot; startup will upgrade an older snapshot to head.

From `backend/`:

```sh
.venv/bin/python -m alembic upgrade head
.venv/bin/python -m app.seed.cli
# Explicit demo-only reset; loses RK-2048 workflow changes:
.venv/bin/python -m app.seed.cli --reset
```

Normal startup migrations/seed are idempotent. For a future managed deployment apply migrations once before starting workers, then disable automatic migration and seeding. Do not use the current unauthenticated demo for that deployment without completing the safety checklist.

## Service-reminder worker

Defaults: `RK_SERVICE_REMINDERS_ENABLED=true`, `RK_SERVICE_REMINDER_INTERVAL_SECONDS=60`, `RK_SERVICE_REMINDER_BATCH_SIZE=100`. Checks run at startup and periodically while the backend runs; shutdown waits for an in-flight bounded transaction. The next startup processes missed due dates. Reminders are persisted local in-app records, not external delivery. `0005_service_schedules` adds provider-linked schedules, per-audience reminders and contact history. Keep only demo data; selected roles/provider IDs are not authentication.

## Running

**Simplest in this workspace:** `cd /Users/sangamesh/Documents/LTspice/RAMUKAKA && bash scripts/dev.sh` starts both servers, waits for `/health` and the browser HTML, and stops both on Ctrl+C. From another checkout, run `bash scripts/dev.sh` at its root. Startup migrates to `0005_service_schedules` and seeds only missing demo data. If servers already occupy 8000 or 5173, stop **only your own** sessions before using the launcher. Alternatively, use two terminals, from `backend/` and `frontend/` respectively:

```sh
.venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

```sh
npm run dev
```

Use http://127.0.0.1:5173: `/` offers a customer or provider portal, `/customer/home` stores household/asset dates, `/customer/chat` stores deterministic service conversations, `/customer/cases` holds decisions, and `/provider` holds local provider records/queues. Documentary demo pages are under `/project`. This is role attribution, not login. Proxy target is port 8000; `strictPort` makes frontend port conflicts explicit. The Swagger UI is http://127.0.0.1:8000/docs. Its optional CDN assets may require network; `/openapi.json` itself is local.

Build with `npm run build`; nginx's SPA fallback serves deep links in Compose. The backend image uses Python 3.12 and a non-root user; a named volume preserves database data. Compose loads only safe example values and forces mock mode. Docker must be installed; see verification record for whether it was available.

For the protected online competition demo, use the root `render.yaml` and `Dockerfile.render` rather
than the local Compose file. Follow the exact [Render deployment guide](deployment-render.md). The
hosted image fails closed without a secret demo PIN, rate-limits Gnani, exposes only `/health`
without authentication and uses ephemeral SQLite on Render's Free plan. Its demo data can reset on
spin-down, restart or deploy. This is still not production identity or multi-tenant authorization.

## Validation

Current integration-MVP validation: **220 backend tests** and **55 frontend tests** passed; frontend lint and production build passed. The suite uses a fake HTTP transport to verify the Gnani contract without exposing a credential or making a billable vendor request. Run a final real Gnani rehearsal locally after configuring the key. To run real-server API and browser checks from the root, use `backend/.venv/bin/python scripts/smoke.py --browser` (or alternate ports). It uses an isolated temporary SQLite database and shuts down its subprocesses.

## Troubleshooting

- API errors in UI: start backend, check `/health`, then inspect the visible API error. No invented fallback records are used.
- 403 on action: obtain the matching current-scope approval and use the correct demo attribution.
- 409 on confirmation: for RK-2048 advance the first three steps at `/project/simulation`; for any other case submit a matching provider quote at `/provider`, household approval at `/customer/cases/<caseId>`, mock assignment and local service report first.
- 409 after rejecting a quote: deliberate block; explicitly reset the demo to replay the original story.
- Port occupied: stop the process you own or configure coordinated proxy/ports. `scripts/dev.sh` always checks 8000/5173; the separate smoke runner accepts `--backend-port` and `--frontend-port` for isolated local testing. It refuses to kill unrelated servers.
- Venv missing: create it with Python 3.12; `.python` is only a local convenience, not a required checked-in runtime.

All development artifacts are ignored. Do not commit databases, secrets, browser binaries, virtual environments or screenshots containing personal data.
