# Ramu Kaka 

An auditable household asset-memory and service-coordination application for The Ken Case Competition. Ramu Kaka connects an appliance's history, a repair case, scoped human permissions, provider work, and household verification in one shared record.

**This is a runnable full-stack, local demonstration with production-oriented structure—not a production-ready hosted service. All external integrations are mocked.** No payments, bookings, calls, shipments or messages leave the application. Real authentication and household isolation are not implemented; bind to loopback and use demo data only.

## What works

- `/` lets you choose a **customer** or **provider** portal. `/customer` is the household dashboard; `/customer/home` holds inventory and household records, `/customer/chat` holds service conversations, and `/customer/cases` (or `/customer/cases/:caseId`) holds approvals and verification. `/provider` holds the provider directory and queue; `/provider/cases/:providerId/:caseId` and provider queue links open case work. Documentary views, including Simulation, Evidence Ledger, Rails & APIs, System Prompt, Business Plan, Risks & Safeguards, and Public Landing, live under `/project`.
- Persistent SQLite households, members, appliances (16 service categories), household-entered installation/purchase/warranty-expiry/next-service dates and serial numbers, cases, quotes, service reports, decisions, evidence, approvals, connector logs, providers, chat conversations/messages and notifications. Add/edit inventory and unverified local provider records from the UI; updates survive restart.
- Saved, deterministic service chat answers only from recorded household assets, dates and case state. It can draft an appliance complaint, but creates a case only after explicit confirmation; customer and assigned-provider messages are stored locally, not sent externally.
- Server-enforced approvals before spending, changing provider or sharing the fixed minimal payload. Authorizations bind to the current service scope; mock payments are idempotent.
- New cases start without an invented price or provider: submit a quote as a matching local provider record, approve the exact amount in the customer portal, assign through a mock-only connector, record an attributable local provider report, then confirm with **both provider and household**. Either party reporting unresolved reopens the case. Unassigned cases can be cancelled without claiming completion.
- A deterministic, one-event-at-a-time RK-2048 demonstration and scoped reset.
- Local signup storage with explicit consent; no outbound email.
- Swagger/OpenAPI, Alembic migrations, typed React API client, tests and container configuration.

## Automatic service-date reminders

Customers can register a provider-linked next service date in **My Home → Service schedules**. A provider/company can register or revise the date in **Provider Desk → Service schedules**. Schedules persist in SQLite, with revision-safe rescheduling, cancellation/reactivation, and local provider follow-up messages visible to the customer.

A real local background worker checks at startup and every **60 seconds** while the backend is running. It creates separate **in-app reminders for the customer and provider** within seven days before service and again when due. Repeated checks/restarts do not duplicate reminders for the same schedule revision/stage/audience. Provider follow-up records acknowledge the provider reminder; the customer can separately acknowledge theirs. Portal screens refresh every 15 seconds. Restart catches up on due dates after downtime; the worker cannot run when the backend is stopped.

These are working local reminders, **not SMS, WhatsApp, email, browser push or phone calls**. An appliance's standalone date field is not a provider-linked reminder subscription: create a service schedule to enable reminders. Migration `0005_service_schedules` adds schedules, audience-specific reminders and contact history without inventing dates or changing existing rows.

## Automatic local coordination

For a new case, save household coordinates in its customer case view and shop coordinates in the provider portal. Opening an eligible customer case automatically chooses the nearest available matching **recorded** shop, persists a simulated provider conversation, and prepares a fixture offer. The customer approves **total cost and timing together**; assignment then happens automatically using local mocks. The provider portal's **Report simulated completion (mock)** action records provider-reported completion and a local customer notification. It never fabricates household verification.

The fixture total is **INR 1,500**, with a next-day **10:00–12:00 UTC** simulated slot. These are demonstration values, not market prices or actual availability. Distances use saved coordinates and Haversine straight-line distance, not road travel. Shops with unknown coordinates are excluded. State survives reload/restart; automatic offer preparation happens when the customer case page is open, not through a background worker.

**No live shop directory, geocoding, AI inference, provider phone calls, or external delivery is implemented.** Real operation still requires authenticated accounts, verified provider contact details, location/search and telephony adapters, credentials, legal/consent handling, and durable background jobs. The normal database has been backed up and migrated through `0005_service_schedules` with pre-existing values preserved.

See [working-model instructions](docs/working-model.md) for both automated and manual paths.

## Source and safety provenance

The initially opened `RAMUKAKA` directory was empty and not a Git repository. The reference URL returned HTTP 401. At the user's follow-up instruction, the new project was created **directly in `RAMUKAKA`**, not in a sibling directory. No original source or assets were available or changed. The interface is original and based on the supplied product specification; fidelity to the inaccessible prototype is **not claimed**. Exact Round 3 questions were not supplied; the submission mapping is thematic, not fabricated question numbering.

## Architecture

```text
frontend/       React + TypeScript + Vite + Router + Tailwind + TanStack Query
backend/        FastAPI + Pydantic + SQLAlchemy 2 + SQLite + Alembic
shared/         implementation contract, JSON Schema and documentary sample data
docs/           architecture, setup, demo guide, API, safety, submission mapping
scripts/        one-command development launcher, SQLite snapshot backup, isolated browser smoke tests, tree printer
```

Browser → same-origin Vite/nginx proxy → FastAPI routes → approval/lifecycle services → SQLAlchemy. All connector operations run through deterministic mock adapters and produce truth-labeled audit records. The UI never owns the safety decision. See [architecture](docs/architecture.md).

## Prerequisites

- Python **3.12** (3.12+ is supported; validation uses 3.12).
- Node.js **22.12+** and npm (Node 24 LTS recommended).
- One terminal with the launcher, or two terminals for manual servers. Docker Compose is optional.
- No API keys or external accounts.

## Run both servers with one command

From any directory, in the prepared workspace:

```sh
cd /Users/sangamesh/Documents/LTspice/RAMUKAKA && bash scripts/dev.sh
```

Wait for the readiness message, then open http://127.0.0.1:5173 and choose a portal. Keep the terminal open; Ctrl+C stops both servers. The launcher automatically migrates through `0003_service_chat` and idempotently seeds on startup. If you already have servers running, stop **your own** sessions first; the script refuses occupied ports (8000/5173). On a fresh checkout at another path, run `bash scripts/dev.sh` from that checkout's root.

## Backend setup and start

For manual setup or a fresh checkout, from the project root:

```sh
cd backend
python3.12 -m venv .venv
.venv/bin/python -m pip install --cache-dir .pip-cache -r requirements.lock.txt
.venv/bin/python -m alembic upgrade head
.venv/bin/python -m app.seed.cli
.venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

If using this already-prepared workspace, `.venv` exists; run the last three commands without recreating it. Default SQLite database: `backend/data/ramukaka.db`. Startup also migrates and idempotently seeds if necessary. Explicit commands above document the lifecycle. Never use migration downgrade as a simulation reset.

Backend: **http://127.0.0.1:8000** · Swagger: **http://127.0.0.1:8000/docs** · Health: **http://127.0.0.1:8000/health**

## Frontend setup and start

In a second terminal, from the project root:

```sh
cd frontend
npm ci --cache .npm-cache
npm run dev
```

Frontend: **http://127.0.0.1:5173** (also accessible as `http://localhost:5173`). The dev proxy forwards `/api` and `/health` to `127.0.0.1:8000`. No frontend environment secrets are needed.

## Environment

Defaults work without any environment file. [.env.example](.env.example) contains safe placeholders only. Export variables before starting the process, or explicitly use:

```sh
# From backend/. This example selects backend/ramu_kaka.db rather than the default data path.
.venv/bin/python -m uvicorn app.main:app --env-file ../.env.example --host 127.0.0.1 --port 8000
```

`DATABASE_URL`, `CONNECTOR_MODE`, `APP_ENV`, `AI_PROVIDER` and reserved vendor keys are recognized. `RK_DATABASE_URL`/`RK_CONNECTOR_MODE` remain compatibility aliases. Alembic and the seed CLI use exported variables; they do not automatically read `.env`. Use one consistent database URL for all commands. See [setup](docs/setup.md).

Real credentials would belong only in backend environment variables or a deployment secret manager. **Adding keys or setting a live mode does not enable an integration:** unimplemented non-mock connector/model modes fail closed. Never place secrets in `VITE_*`, frontend files or audit data.

## Back up the existing database

Before schema changes or risky experiments, from the root:

```sh
backend/.venv/bin/python scripts/backup_db.py
```

The SQLite snapshot is verified and written under `backend/data/backups/` (ignored by Git). Back up before applying `0003_service_chat` to an older database; this migration adds optional asset dates/serial number and persisted conversation tables without resetting cases. The earlier `0002_working_model` upgrade was preceded by a snapshot and per-table comparison of pre-existing rows. See [working model guide](docs/working-model.md) for a new-case walkthrough and manual restore precautions.

## Tests and build

In this workspace: **223 backend tests** and **58 frontend tests** passed; frontend lint and build also passed. Re-run with:

```sh
# From backend/
PYTHONDONTWRITEBYTECODE=1 .venv/bin/python -m pytest --basetemp=data/pytest-tmp

# From frontend/
npm run lint
npm test
npm run build
```

Real HTTP + optional Chromium smoke checks, from the project root (uses an isolated temporary DB; default ports 8000 and 5173 must be free):

```sh
backend/.venv/bin/python scripts/smoke.py
# For full browser checks, first install Chromium locally from frontend/:
# PLAYWRIGHT_BROWSERS_PATH=.browsers npx --no-install playwright install chromium
backend/.venv/bin/python scripts/smoke.py --browser
# If your own dev servers are already running, use separate loopback ports instead:
backend/.venv/bin/python scripts/smoke.py --browser --backend-port 18000 --frontend-port 15173
```

The smoke script starts bounded subprocesses, uses an isolated temporary database under `backend/data`, verifies the API and frontend proxy, then terminates both servers. With `--browser`, Playwright checks the portal chooser, saved customer chat and explicit case creation, provider queue/quote/message/report, household approval, mock assignment, two-party closure, mobile layouts, simulation and local signup; a second browser scenario covers household/asset creation and provider creation through the local API. Chromium must be installed locally. Logs/screenshots stay in ignored `artifacts/`; the runner also regenerates `shared/schemas/openapi.json` from the API. It never resets a user's normal database. In this workspace both browser scenarios passed on alternate ports with an isolated database; the runner's API-check phase was skipped for this documentation-only task to avoid rewriting `shared/schemas/openapi.json`. Browser smoke is a separate check from the unit-test counts above. The requested `bash scripts/dev.sh` launcher refused to start because port 8000 was already occupied; no existing server was stopped.

## Run the Round 3 demonstration

1. Open `/project/demo`. This is the primary jury and recording route.
2. At every checkpoint, click **Run live agent decision**, then complete the single action shown directly beneath it.
3. The same page advances through household approval, mock assignment, service evidence, provider confirmation, household confirmation and guarded closure. Demo attribution changes automatically.
4. Open `/project/rails` only to demonstrate Gnani and the documented Pine Labs/Delhivery responses.
5. Open `/project/evidence?case=RK-2048` to show the resulting decisions, evidence, connector calls and exact messages.

The older `/project/simulation` route remains available for deterministic
rehearsal, but it is no longer the main user journey. For a new case without
simulation, follow the [working model guide](docs/working-model.md).

A rejected quote blocks advancement; the simulator never silently reverses a rejection. All scripted approvals and confirmations are documentary fixtures, not actual people authorizing real transactions. See [simulation guide](docs/simulation-guide.md).

## Mocked versus live

| Capability                      | Implemented behavior                                                                 |
| ------------------------------- | ------------------------------------------------------------------------------------ |
| Gnani competition console       | Optional real STT call to `https://api.vachana.ai/stt/v3`; disabled until a local key is supplied |
| Pine Labs competition console   | Exact official UAT payment-link request/response recorded as documentation simulation; no funds move |
| Delhivery competition console   | Wizard records the exact official B2C shipment/tracking request and response; no shipment is created |
| Default scripted workflow       | Deterministic local mocks remain available for repeatable rehearsal                   |
| WhatsApp / Email                | Local connector logs; nothing delivered                                              |
| Service chat                    | Persisted local messages and deterministic rules/fixtures                             |
| Gemini agent decision           | Optional live `gemini-3.8-flash` structured next-action decision; server allowlist and guards remain authoritative |
| Claude / OpenAI                 | Proposed only; no adapter enabled                                                      |
| Local FastAPI / SQLite / signup | Actually executed locally; not an external `LIVE_API` integration                    |

`LIVE_API` is used only for server-recorded Gnani and Gemini HTTP calls when each is explicitly enabled. Pine Labs and Delhivery remain `DOCUMENTATION_SIMULATION`, as required by the Wizard-of-Oz brief. Local user submissions are `REAL_HUMAN_INPUT`; roadmap claims are `PROPOSED_CAPABILITY`.

## Containers

```sh
docker compose up --build
```

Ports are loopback-bound at 5173/8000. SQLite persists in a named volume; nginx proxies the API. Docker is optional and must be installed separately. Container builds are not implied by passing local tests.

## Protected online competition demo

The repository includes a separate single-service Render deployment in `render.yaml` and
`Dockerfile.render`. It serves the frontend and FastAPI on one origin, stores SQLite on Render's
ephemeral free-tier filesystem, requires the username `demo` plus a secret PIN, rate-limits live
Gnani uploads and leaves only
`/health` unauthenticated. Follow [the Render and `runs-on.dev` guide](docs/deployment-render.md).
This access gate is suitable for the bounded jury demo; it does not turn the application into a
public multi-user production service. Free-tier SQLite can reset on spin-down, restart or deploy.

## Limits and next steps

The six-step scripted demonstration is scoped to RK-2048; every other new case uses the local quote/report workflow. Saved chat is rules-based, not live AI; recorded asset dates and provider reports are _unverified local inputs_, not manufacturer coverage, signed independent proof, uploaded documents or real appointments. Customer notes and chat messages cannot be promoted to service evidence. Production rollout requires real identity/tenant authorization, verified providers and evidence, secure uploads, documented partner contracts, signed webhooks, durable jobs/outbox, rate limits, monitoring, retention/deletion policies and PostgreSQL concurrency validation. Portal choice and the current demo role selector are **not authentication**. A public landing _view_ does not make this unauthenticated local backend safe to expose online.

- [Setup](docs/setup.md) · [API contract](docs/api-contract.md) · [Safety rules](docs/safety-rules.md)
- [Submission mapping](docs/submission-mapping.md) · [Validation record](docs/verification.md)
- MIT licensed; vendor names do not imply partnerships.
  Thank you:)
