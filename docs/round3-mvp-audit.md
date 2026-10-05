# Round 3 projection-to-MVP audit

Audit date: 2026-10-04. Scope: current `main` baseline plus `feature/ken-rails-mvp` integration work.

## Outcome

The repository was already a strong local full-stack demonstration, not an empty skeleton. The core safety model, case lifecycle, evidence ledger, approval guards, two-sided closure, resettable RK-2048 simulation, household/provider views, migrations and automated tests were implemented. The material Round 3 gap was the three partner rails: the baseline explicitly refused all real connections and incorrectly used Delhivery's name for internal technician assignment/evidence.

The MVP now separates internal coordination from partner logistics and provides a visible competition rail console. It does not invent private partner contracts.

## Projection audit

| Agreed projection | Baseline finding | MVP result |
| --- | --- | --- |
| One persistent case across the ecosystem | Implemented in case, event, decision, evidence and connector tables | Complete |
| L3 execution with approval boundaries | Backend enforces scoped spend, provider-change and sensitive-share approval | Complete |
| Payment cannot occur before approval | Guarded and idempotent; automated negative tests exist | Complete |
| Proof at every checkpoint | Timestamped evidence, decision and connector ledgers exist | Complete for demo; cryptographic proof remains future work |
| Provider and household must both finish | Closure guard and unresolved/reopen path implemented | Complete |
| Five-minute deterministic recording | RK-2048 reset and six-step progression implemented | Complete; final rehearsal/recording remains an operator task |
| Gnani must actually process audio/text | Baseline mock only | Live multipart STT adapter and UI added; real vendor rehearsal needs a local key |
| Agent must be an AI model following the prompt | Baseline deterministic rules only | Reviewed Gemini 3.8 Flash adapter chooses one server-allowlisted next action; real rehearsal needs a backend key |
| Pine Labs may use documented responses | Baseline generic mock receipt | Official UAT payment-link contract recorder added; approval and amount checked |
| Delhivery may use documented responses | Baseline incorrectly represented technician assignment as Delhivery | Internal coordinator separated; exact official B2C request/response recorder added |
| Every partner request/response visible | Generic connector ledger existed | Competition calls now preserve endpoint, documentation source and exact response |
| Honest provenance | Four truth labels existed | Gnani live vs documentary Pine/Delhivery rules enforced |
| Household and provider interfaces | Implemented | Complete for local demo |
| Business, system prompt, risk and public pages | Implemented | Complete for submission presentation |

## Partner rail status

### Gnani

- Official endpoint: `POST https://api.vachana.ai/stt/v3`.
- Authentication: backend-only `X-API-Key-ID` from `GNANI_API_KEY`.
- Inputs: multipart audio plus language, preferred language, transcription format and native-numeral setting.
- Ledger: filename, media type, byte size, SHA-256, form fields, HTTP status, exact raw response and parsed response.
- Safety: endpoint host/path pinned; 10 MB limit; audio bytes and key are not persisted.
- Remaining task: run one real call locally and confirm the competition credential is active.

### Pine Labs

- Official UAT endpoint: `POST https://pluraluat.v2.pinepg.in/api/pay/v1/paymentlink`.
- Competition behavior: documentation simulation only; no OAuth call and no money movement.
- Guard: current ₹749 approval must exist and the entered request amount must match it.
- Ledger: endpoint, official documentation URL, exact request and exact response.

### Delhivery

- Product choice: B2C, because the demo moves a spare part/appliance between a business and household.
- Required operations: package shipment creation and shipment tracking; pincode serviceability is useful; reverse pickup is optional.
- Competition behavior: the wizard enters the exact endpoint/request/response from the supplied Delhivery documentation.
- Safety: only official `delhivery.com` HTTPS URLs are accepted; no shipment is created.
- Remaining task: copy the exact endpoint and sample bodies from the competition/Delhivery One B2C documentation.

## Verified build

- Backend: 223 tests passed.
- Frontend: 56 tests passed.
- Frontend lint: passed with zero warnings.
- Frontend production build: passed.
- Gnani and Gemini live code paths: contract-tested with in-memory fake HTTP responses; no credential was logged.

## Explicit non-goals for this submission

- Production authentication/tenant isolation
- Real Pine Labs payments
- Real Delhivery shipments
- Cryptographic media authenticity
- Public deployment of the unauthenticated backend
- General autonomous provider discovery

These remain production work and must not be claimed in the Round 3 recording.
