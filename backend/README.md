# Ramukaka backend

Python 3.12+ / FastAPI / Pydantic 2 / SQLAlchemy 2 / SQLite / Alembic. Implements the shared API contract under `/api`, plus `/health`. **Local-only demonstration, not production authentication or a live integration.** All backend files and default runtime database files live under this directory.

## Run (parent-owned environment)

Run these commands from `RAMUKAKA/backend` after the parent creates/activates its Python 3.12+ environment and installs `requirements.txt`:

```sh
PYTHONDONTWRITEBYTECODE=1 python -m alembic upgrade head
PYTHONDONTWRITEBYTECODE=1 python -m app.seed.cli
PYTHONDONTWRITEBYTECODE=1 python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Startup also applies Alembic migrations and idempotently seeds missing demo data by default. Disable with `RK_AUTO_MIGRATE=false` / `RK_AUTO_SEED=false` when the parent manages these separately. Seed CLI `--reset` restores **only RK-2048 workflow artifacts**, never signups, other cases, or shared reference records. Do not use an Alembic downgrade as a demo reset: downgrades remove schema/data.

- SQLite default: `backend/data/ramukaka.db`. Relative `RK_DATABASE_URL=sqlite:///data/another.db` resolves inside backend, not the caller's working directory. File databases outside backend are rejected. `sqlite:///:memory:` is supported for tests.
- Canonical environment names `APP_ENV`, `DATABASE_URL`, `CONNECTOR_MODE`, and `AI_PROVIDER` are supported; `RK_DATABASE_URL` and `RK_CONNECTOR_MODE` remain compatibility aliases. Reserved API keys are secret settings excluded from dumps/repr and are not used by mocks.
- `CONNECTOR_MODE=mock` and `AI_PROVIDER=mock` are the only supported modes. `real`, `live`, `external`, etc. fail configuration validation. No network clients, API credentials, or live fallbacks exist.
- `RK_FRONTEND_ORIGIN=http://localhost:5173` is the single allowed CORS origin. Only exact local HTTP origins are accepted. The frontend should proxy `/api` and `/health` to port 8000 and use relative URLs.
- `.env.example` documents variables; export them in the shell/container. The application intentionally does not implicitly read an arbitrary working-directory `.env`.
- Interactive API schema: `/docs`; OpenAPI: `/openapi.json`.

Docker (from this directory):

```sh
docker build -t ramukaka-backend .
docker run --rm -p 127.0.0.1:8000:8000 ramukaka-backend
```

The image runs as an unprivileged user. Mount a writable volume at `/backend/data` for persistence; its permissions must allow UID 10001.

## Behavior and safety

RK-2048 is Sangamesh's Kent water purifier / Low water flow / INR 749 / `waiting_for_approval`, with six initial documentary events. `/api/simulation/next` adds exactly one event per step: customer approval → provider assignment with mock payment → service evidence → provider completion → household confirmation → final closure. The clean demo is deterministic, including IDs, timestamps, connector responses, and reset/replay snapshots. Actual local form submissions are timestamped at submission and labeled `REAL_HUMAN_INPUT`; seeded, simulated, and mock-produced artifacts are `DOCUMENTATION_SIMULATION`. No mock record claims `LIVE_API`.

- Spend approval binds the quote amount, selected provider, asset, and service revision. Payment consumes that exact authorization and stores a unique receipt. Replays return the existing outcome without a second mock charge or assignment.
- Provider-change approval binds the exact old/new provider and revision. Executing it clears assignment/confirmations, makes old evidence inapplicable, invalidates old sharing scope, and requests fresh spend approval. The action body cannot supply a different target or amount.
- Sensitive-sharing approval binds a fixed minimal payload: case, asset, selected provider, fixed service category and an instruction to contact the household in-app. No raw note, name, address, email, phone, or credential is sent to adapters. These payload fields deliberately avoid actual sensitive data in this demo.
- SQLite `BEGIN IMMEDIATE` serializes check-and-consume across workers, with a unique per-approval receipt as an additional invariant. Failed transitions roll back atomically. Denied domain actions persist a safe decision/rule after rollback.
- Positive or negative confirmation requires current service evidence, assignment, and approved scope. Closing requires **both parties** plus the same service guard, whether invoked by manual confirmation or the simulator. Negative confirmation clears that party's flag and reopens the case. Simulator cannot override unresolved human feedback; a human must reconfirm.
- Generic `customer_note` and `emergency` events cannot supply service evidence, grant approval, set flags, or close cases. Emergency reporting explicitly states that no dispatch or live assistance occurred.
- `X-Demo-Role: household|provider` is optional on original demo routes but required with the matching value on workspace-write and service-chat/queue routes. **It is not authentication**: callers choose the header and IDs. The portal role UI is navigation, not identity verification. No production authorization, multitenancy isolation, or deployment hardening is claimed. Keep bound to loopback.
- Connector calls are allowlisted reference-only request/response records. Raw human notes remain local case data, not connector/audit reasons. Validation errors omit raw input. Signup is local-only, requires strict boolean consent, normalizes email case, returns 409 on duplicates, and sends nothing.
- Mock Delhivery assignment/evidence operations are documentary placeholders, **not claims that Delhivery offers a technician-service API**. AI classification is a fixed fixture, not inference; Gnani does not place calls; Pine Labs moves no money; WhatsApp/Email deliver nothing.

Statuses used: `awaiting_quote`, `waiting_for_approval`, `approved`, `approval_rejected`, `assigned`, `awaiting_confirmation`, `closed`, `reopened`, `cancelled`. Asset creation requires household ID, name, category, location and installation date; brand/model/notes default to empty strings, while purchase, warranty and next-service dates and serial number may be omitted. Category is a defined enum (see `app/schemas/workspace.py`), copied into a new case's service category for provider trade matching. The six-step simulation is only for RK-2048. New cases instead wait for an explicit, provider-submitted plan and quote; no amount or provider is invented. The household may cancel before assignment. After approval/mock assignment, a local provider report creates `REAL_HUMAN_INPUT` evidence scoped to the assignment; it is an unverified human claim. Either confirmation order closes only after both parties confirm; new reports clear prior confirmation flags. Demo reset never removes manual cases, inventory or signups.

## Saved service conversations

`app/api/chat.py` and `app/schemas/chat.py` define the `/api/chat/conversations` list/create/detail and household-message routes, `/api/providers/{provider_id}/queue`, `/api/chat/cases/{case_id}/conversations`, and the provider-message route. All require matching caller-selected `X-Demo-Role`. Household messages accept required `text`, optional `asset_id`, and `action` (`message` by default, `confirm_report`, or `cancel_report`). The deterministic assistant moves through `ready` → `await_asset` → `await_problem` → `confirm_report`; selecting an active asset can go directly to `await_problem`. It creates an unquoted case only after an explicit confirmation of a draft, not from free-text assent. It reads stored case status, asset inventory and service dates, not a live AI/provider system. Local customer/provider messages are `REAL_HUMAN_INPUT`; assistant replies are `DOCUMENTATION_SIMULATION`. Provider queue includes assigned cases and unclaimed matching-trade quote requests; linked conversations require assignment and provider replies are denied unless the provider ID matches the current assigned provider on an open case. IDs and header are not proof of identity. See `../docs/api-contract.md` and `../docs/safety-rules.md`.

## Tests

Validation passed **160 tests** on Python 3.12.15, including seven service-chat tests and the environment/provider configuration tests. A Starlette/httpx deprecation warning remains upstream. From `RAMUKAKA/backend`, run:

```sh
PYTHONDONTWRITEBYTECODE=1 python -m pytest -p no:cacheprovider --basetemp=data/pytest-tmp
```

Tests cover endpoint/response contracts, validation/error paths, UTC dates, six-step progression, both closure orders, early confirmation rejection, unresolved reopen/reconfirmation, rejected approvals, scoped/consumed actions, changed amount/provider/revision, idempotent and concurrent mock payments, denial auditing, rollback after adapter failure, truth labels, connector data minimization, strict local configuration/CORS, local signup/duplicates, deterministic demo-only reset, non-demo preservation, and migration/model parity plus upgrade/downgrade. File-backed test databases are temporary directories **inside backend/data**; most tests use in-memory SQLite. Pytest's cache plugin is disabled in project configuration.

Dependencies are locked in `requirements.lock.txt`. Migration/model parity tests, real Uvicorn/Vite health/proxy checks and isolated Chromium end-to-end workflows passed during validation; the earlier integration pass also ran migrations and seed CLI against the normal database. See `../docs/verification.md` and `../docs/working-model.md` for scope and limitations. New inventory/quote/report/cancellation endpoints extend the original documented demo contract.
