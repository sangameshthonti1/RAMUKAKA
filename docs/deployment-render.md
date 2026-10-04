# Protected Render deployment

This deployment is for the Round 3 demonstration, not an unauthenticated production rollout. It
runs the built React application, nginx and one FastAPI worker in a single Render web service. A
single attached disk owns the SQLite database. Do not scale this service above one instance while
it uses SQLite.

## What the deployment files enforce

- `Dockerfile.render` builds the frontend and backend into one image. Only nginx binds to Render's
  public `PORT`; FastAPI listens privately on `127.0.0.1:8000`.
- Every page and `/api` call requires HTTP Basic authentication. The username is `demo`; the
  password is the value of the Render secret `RK_DEMO_ACCESS_PIN`.
- `/health` is deliberately the only unauthenticated route so Render can check the service.
- The Gnani upload route accepts at most 11 MB and is limited at nginx to five requests per minute,
  with a small burst for rehearsal. Other API requests accept at most 1 MB.
- The PIN is converted to a bcrypt password file at startup and removed from the environment before
  nginx and FastAPI start. Startup fails if it is missing or shorter than eight characters.
- The browser and API share one HTTPS origin, so no API URL or secret is built into the frontend.
- `render.yaml` keeps `CONNECTOR_MODE` and `AI_PROVIDER` in mock mode. Only the reviewed Gnani STT
  endpoint can run live; Pine Labs and Delhivery remain documentation simulations.

The PIN gate is appropriate for a bounded jury demo. It is not user authentication, tenant
isolation, authorization, account recovery or an audit-grade identity system.

## 1. Deploy the Blueprint

1. Merge or select the branch containing `render.yaml` and `Dockerfile.render`.
2. Sign in to Render and choose **New → Blueprint**.
3. Connect `sangameshthonti1/RAMUKAKA` and select the deployment branch.
4. Render reads the root `render.yaml`. Review the proposed `ramukaka-round3` web service, Starter
   plan, one instance and 1 GB disk mounted at `/backend/data`.
5. Supply both prompted secrets:
   - `GNANI_API_KEY`: the rotated Gnani key. Never paste it into GitHub or a frontend variable.
   - `RK_DEMO_ACCESS_PIN`: a new private PIN/passphrase of at least eight characters.
6. Deploy the Blueprint and wait for `/health` to become healthy.
7. Open the generated `https://<service>.onrender.com` URL. The browser prompts for credentials.
   Enter username `demo` and the PIN from step 5.

The database URL is already fixed to `sqlite:////backend/data/ramu_kaka.db`. Startup applies
migrations and idempotently adds missing demo fixtures. The attached disk preserves changes across
restarts and deploys. Do not create a second service against the same SQLite file.

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
3. Confirm the Gnani contract says ready without revealing the key.
4. Record a short voice note and verify a `live_succeeded` ledger entry.
5. Review the transcript before attaching it as `REAL_HUMAN_INPUT`.
6. Verify Pine Labs and Delhivery still say `DOCUMENTATION_SIMULATION`.
7. Create a manual Render disk backup before the final jury rehearsal.

## Operations and rollback

- Change the PIN or Gnani key only in Render's secret settings, then redeploy.
- A `429` on Gnani means the demo rate limit was reached; wait rather than bypassing it.
- Render deploy rollback changes the image, not the persisted database. Use a disk snapshot for data
  rollback.
- Keep one worker and one service while using SQLite. PostgreSQL, real identity, per-household
  authorization and durable job infrastructure are prerequisites for a public multi-user product.
- To take the demo offline without losing its disk, suspend the Render service or remove the custom
  domain. Do not delete the disk unless its verified backup is no longer needed.

Official references: [Render Blueprints](https://render.com/docs/infrastructure-as-code),
[Render Docker](https://render.com/docs/docker), [Render disks](https://render.com/docs/disks),
[Render custom domains](https://render.com/docs/custom-domains), and
[`runs-on.dev` records](https://runs-on.dev/docs/records).
