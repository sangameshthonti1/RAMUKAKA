# Protected Render deployment

This deployment is for the Round 3 demonstration, not an unauthenticated production rollout. It
runs the built React application, nginx and one FastAPI worker in a single free Render web service.
Its SQLite database is intentionally ephemeral: Render can erase it whenever the free service
spins down, restarts or redeploys. Startup recreates the seeded demo state. Do not use the free
deployment for unique evidence or data that cannot be recreated.

## What the deployment files enforce

- `Dockerfile.render` builds the frontend and backend into one image. Only nginx binds to Render's
  public `PORT`; FastAPI listens privately on `127.0.0.1:8000`.
- Every page and `/api` call requires HTTP Basic authentication. The username is `demo`; the
  password is the value of the Render secret `RK_DEMO_ACCESS_PIN`.
- `/health` is deliberately the only unauthenticated route so Render can check the service.
- The Gnani upload route accepts at most 11 MB and is limited at nginx to five requests per minute.
  Gemini decisions are limited to ten requests per minute. Both have a small rehearsal burst.
- The PIN is converted to a bcrypt password file at startup and removed from the environment before
  nginx and FastAPI start. Startup fails if it is missing or shorter than eight characters.
- The browser and API share one HTTPS origin, so no API URL or secret is built into the frontend.
- `render.yaml` keeps general connectors in mock mode while enabling the reviewed Gemini decision
  adapter. Gnani STT and Gemini can run live; Pine Labs and Delhivery remain documentation simulations.

The PIN gate is appropriate for a bounded jury demo. It is not user authentication, tenant
isolation, authorization, account recovery or an audit-grade identity system.

## 1. Deploy the Blueprint

1. Merge or select the branch containing `render.yaml` and `Dockerfile.render`.
2. Sign in to Render and choose **New → Blueprint**.
3. Connect `sangameshthonti1/RAMUKAKA` and select the deployment branch.
4. Render reads the root `render.yaml`. Confirm that the proposed `ramukaka-round3` web service is
   on the **Free** plan and has **no persistent disk** before applying it.
5. Supply all prompted secrets:
   - `GNANI_API_KEY`: the rotated Gnani key. Never paste it into GitHub or a frontend variable.
   - `GEMINI_API_KEY`: a Google AI Studio key used only by the backend live-agent endpoint.
   - `RK_DEMO_ACCESS_PIN`: a new private PIN/passphrase of at least eight characters.
6. Deploy the Blueprint and wait for `/health` to become healthy.
7. Open the generated `https://<service>.onrender.com` URL. The browser prompts for credentials.
   Enter username `demo` and the PIN from step 5.

The database URL is already fixed to `sqlite:////backend/data/ramu_kaka.db`. Startup applies
migrations and idempotently adds missing demo fixtures. On the Free plan this file does **not**
survive a spin-down, restart or deploy. Rehearse from freshly seeded state, and do not rely on a
case created online still being present later.

The Free service can also sleep after inactivity and take about a minute to wake. Open the site a
few minutes before recording. Upgrade only when durable demo state becomes necessary: change the
service to a paid compute plan, attach one persistent disk at `/backend/data`, and keep a single
instance while SQLite is in use.

Adding a card is not a one-time purchase. Render's USD 1 card check is a temporary authorization,
but a card left on the account can be charged for paid resources or usage beyond included limits.
Check the Render Billing page and configure available spend limits before enabling paid resources.
If Render requests a card only to verify a free account, the service must still show **Free** and
no disk before deployment; account verification does not itself convert this Blueprint to paid.

## 2. Connect a `runs-on.dev` name

The service must be healthy on its Render URL before adding the custom name.

1. In Render open **Settings → Custom Domains** and add the exact claimed name, for example
   `ramukaka.runs-on.dev`.
2. Copy the exact CNAME target Render displays. Do not copy a value from an example.
3. Sign in at `https://runs-on.dev/manage`, open the claimed name, select **CNAME**, paste the Render
   target and save.
4. Return to Render and select **Verify**. Wait for DNS and certificate issuance.
5. Open `https://ramukaka.runs-on.dev`, authenticate as `demo`, allow microphone access, and run one
   short Gnani rehearsal.

If Render asks for a TXT record at the same hostname, `runs-on.dev` cannot publish that TXT beside a
CNAME. Do not weaken or invent DNS records. Keep the working Render URL and configure a `URL`
redirect in `runs-on.dev/manage`, or use a separately owned domain whose DNS supports Render's full
verification request.

## 3. Pre-recording checklist

1. Confirm `GET /health` reports `connector_mode: mock`.
2. Sign in through the PIN gate and select the correct target case on **Project → Rails & APIs**.
3. Confirm the Gnani and Gemini contracts say ready without revealing either key.
4. Record a short voice note and verify a Gnani `live_succeeded` ledger entry.
5. Review the transcript before attaching it as `REAL_HUMAN_INPUT`.
6. Run one Gemini decision and verify its allowlisted action, rule and exact in-app message.
7. Verify Pine Labs and Delhivery still say `DOCUMENTATION_SIMULATION`.
8. Keep a local copy of any special rehearsal inputs; the free deployment has no durable disk.

## Operations and rollback

- Change the PIN, Gnani key or Gemini key only in Render's secret settings, then redeploy.
- A `429` on Gnani means the demo rate limit was reached; wait rather than bypassing it.
- Every free-service spin-down, restart or deploy can reset SQLite to the seeded demo state.
- Keep one worker and one service while using SQLite. PostgreSQL, real identity, per-household
  authorization and durable job infrastructure are prerequisites for a public multi-user product.
- To take the demo offline, suspend the Render service or remove the custom domain.

Official references: [Render Blueprints](https://render.com/docs/infrastructure-as-code),
[Render Docker](https://render.com/docs/docker), [Render disks](https://render.com/docs/disks),
[Render Free services](https://render.com/docs/free),
[Render custom domains](https://render.com/docs/custom-domains), and
[`runs-on.dev` records](https://runs-on.dev/docs/records).
