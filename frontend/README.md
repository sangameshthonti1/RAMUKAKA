# RamuKaka frontend

The frontend of a full-stack, local household-operations demonstration. All files, dependencies, build outputs and npm caches created for this frontend live under this directory. The backend and parent documentation are maintained separately.

## Run

Requires Node.js 22+ and npm. From `RAMUKAKA/frontend`:

```sh
npm ci --cache .npm-cache
npm run dev
```

Vite defaults to port 5173. Both `/api` and `/health` are proxied to `http://127.0.0.1:8000`. Browser requests use same-origin relative `/api` URLs; no service credentials, hosted APIs, external fonts, analytics or remote images are required. Backend availability is required for operational records. Fetch errors never fall back to invented data.

```sh
npm run lint
npm test
npm run build
```

`npm test` uses Vitest, React Testing Library, user-event and a mocked fetch implementation. External network is disabled in the test setup. These tests validate frontend rendering, request bodies and interaction/error states, not the real backend's business guards. `npm run build` performs strict TypeScript checking and writes the static application to `dist/`.

`.npmrc` keeps npm downloads and logs in `.npm-cache/`. Vite and TypeScript caches stay in `node_modules/`. No git repository, parent files or backend records are created by frontend commands.

## Views

| Route                                                           | View                                                                                                              |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `/`                                                             | Choose customer/provider portal; selection does not verify identity                                               |
| `/customer`                                                     | Household dashboard with local counts and cases                                                                   |
| `/customer/home`                                                | My Home: participants, asset details/history and local complaint form                                             |
| `/customer/chat`                                                | Saved rules-based service conversations, explicit appliance/problem draft/confirmation and truth-labeled messages |
| `/customer/cases`, `/customer/cases/:caseId`                    | Household case list/detail, timeline, approvals and confirmations                                                 |
| `/provider`                                                     | Provider Desk: local directory and provider selection                                                             |
| `/provider/cases/:providerId/:caseId`                           | Provider queue case: quote, assigned-case conversation, local service report and confirmation                     |
| `/project/cases`, `/project/cases/:caseId`                      | Case Room: timeline, evidence, approvals, notes, confirmations and scoped mock actions                            |
| `/project/my-home`                                              | Project-console My Home view                                                                                      |
| `/project/simulation`                                           | Six-step documentary simulation and acknowledged demo-only reset                                                  |
| `/project/evidence`, `/project/rails`, `/project/system-prompt` | Ledger, rail declarations and backend-owned prompt                                                                |
| `/project/business-plan`, `/project/risks`, `/project/landing`  | Business hypotheses, limitations and consented local signup                                                       |

Several older top-level routes (for example `/cases`, `/my-home`, `/simulation`, `/providers`) redirect into these portals/project routes. `/customer/home?report=1` opens the complaint form; `/project/evidence?case=RK-2048` filters the ledger. Unknown routes and cases have explicit recovery states.

## Workflow and truthful boundaries

- The supplied RK-2048 data comes from the backend: Sangamesh, Kent water purifier, Low water flow and a ₹749 service quote. The frontend does not replace the supplied complaint, infer a different amount or invent success. New assets require a category from the backend enum; purchase/warranty/next-service dates and serial number are optional local record fields, not verified manufacturer facts.
- The portal pages display a MOCK/DEMO banner; the landing portal choice states the local mock limitation. Evidence, events, decisions, notifications and connector calls display their server-supplied truth labels. Assets/providers are described as local records, not independently verified external inputs. All manual forms identify local human input.
- To decide a pending spend request, select **Household** in the header, then approve or reject the server-provided quote. No arbitrary amount is sent.
- Positive confirmations require approved service, provider assignment and matching service evidence. In the supplied demo, use Simulation to reach assignment and evidence first. A selected provider ID alone is not proof of assignment. The server owns the guard and any 403/409 is displayed.
- For manual completion, select **Provider** attribution and submit a provider assessment, then select **Household** attribution and submit household verification. Either party can report **Unresolved**. The UI does not locally forge closure or confirmation flags.
- Portal choice and header role selection are UI controls, not identity. They send caller-selected `X-Demo-Role` (`household` or `provider`) for local attribution; chat/queue and workspace-write routes require the matching header, but IDs and roles can be supplied by any local caller. This is **not authentication or a security boundary**.
- The simulation advances only one event per click. There is no autorun, implicit approval retry or hidden reset. Rejected approvals can block it. Reset needs explicit acknowledgement and applies to the backend's demo scope only.
- Payment, provider change and sensitive sharing buttons call the backend action endpoints even when permission is absent, so the actual server guard is observable. They are labeled mock; no real spend or sharing occurs.
- Additional requests specify a provider target or the server-defined minimal share scope. Approval resolution and execution are separate actions.
- Service chat is saved and rules-based, not live inference. A selected active household asset plus problem description becomes a draft; only explicit confirmation creates a local case awaiting quote. Free-text “yes” does not grant permission. Assistant messages are `DOCUMENTATION_SIMULATION`; local household/provider text is `REAL_HUMAN_INPUT` (provenance, not identity or proof). Status and service dates reflect stored records only. The provider queue includes assigned cases and unclaimed matching-trade quote requests. Case conversations are shown to the currently assigned provider ID; replies require that assignment and an open case, but no actual provider identity is established or contacted.
- My Home adds/edits persistent households, members and appliances. Provider Desk adds/edits provider records and handles manual quotes and service reports. A new case begins without a quote; the provider selects a matching trade and enters a real local service plan. Only after explicit household approval does mock assignment occur. Provider evidence records an unverified local claim for the current provider/revision; a generic note cannot masquerade as a service report. The documentary simulation applies only to RK-2048. Household can cancel an unassigned new case without falsely marking it complete.
- Signup posts only name, email and `consent: true` to the local backend. No external signup, payment, subscription or email delivery occurs.
- TanStack Query uses centralized keys. Existing workflow mutations globally invalidate queries, including failed actions that may have produced a backend denial/audit record; chat mutations update/invalidate their conversation queries. Mutations are never automatically retried.

## Structure

- `src/assets`: bundled SVG artwork; no externally fetched design assets.
- `src/components`: shared states, case lists/timeline and focused mutation forms.
- `src/layouts`: responsive console/navigation, mock banner and attribution selector.
- `src/pages`: customer, provider and project view modules, including saved service chat.
- `src/hooks`: query keys and globally invalidating mutations.
- `src/services`: typed relative-URL API client and FastAPI error translation.
- `src/store`: session-only demo attribution; no authentication token storage.
- `src/types`, `src/utils`: contract types and formatting helpers.
- `public`, `tests`: static metadata and offline regression tests.

## Container handoff

`Dockerfile` builds with Node and serves `dist/` using nginx on port **80**. `nginx.conf` preserves API paths while proxying `/api/` and `/health` to **`backend:8000`**, the expected Compose service name. SPA routes fall back to `index.html`; missing static assets do not. Compose orchestration belongs to the parent project. Container startup is not covered by frontend tests. The latest unit run passed **44 tests**; lint and production build passed. Real backend/browser integration passed in an isolated database via the project-root `scripts/smoke.py --browser` checks and `e2e/smoke.mjs` plus `e2e/workspace.mjs`; see `../docs/verification.md` for how output writes were redirected in this documentation pass.

## Design/content deviations

The source was empty and the reference was unavailable (HTTP 401). This is an original restrained warm off-white, navy/teal interface with orange approval accents, rather than a claimed reproduction. It uses locally bundled illustration and system fonts. The exact user Round 3 questions were unavailable: Business Plan offers a clearly labeled thematic mapping (problem, customer, workflow, feasibility, economics, safeguards), while the parent owns the complete documentation mapping. All business/model/market claims are hypotheses; no traction or outcome statistics are invented.
