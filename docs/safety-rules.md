# Safety rules and production boundaries

The canonical agent instruction is `backend/app/agent/prompt.py`, exposed by `/api/system-prompt`. A prompt is not the enforcement mechanism: backend services enforce the following even if a caller bypasses React.

| Boundary                 | Enforcement                                                                                                                                                                    |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Spend only with approval | Approved amount/provider/asset/service revision must match; authorization consumed once, receipt prevents duplicate mock payments                                              |
| New work                 | Requires a local quote from an eligible matching-trade provider; no amount/provider assumed at intake. Revised plans invalidate old unused authorization                       |
| Cancellation             | Only unassigned non-demo cases; revokes unspent permissions, preserves history and never claims completion                                                                     |
| Provider reports         | Only for approved assigned provider/revision; local claim labeled REAL_HUMAN_INPUT, not independently verified; new report clears old confirmations                            |
| Chat case creation       | Local rules require an active asset in the conversation's household, a problem draft and explicit `confirm_report`; ordinary text cannot approve or book work                  |
| Provider chat            | Queue lists assigned or unclaimed matching-category quote cases; case threads require current assignment, replies require current assignment and non-closed/non-cancelled case |
| Provider changes         | Separate approval names target provider and previous service revision; execution invalidates old service scope                                                                 |
| Sensitive sharing        | Separate approval for fixed minimum payload; no arbitrary request body, address, name, phone, email or secret sent                                                             |
| Closure                  | Assigned approved service + current service evidence + both provider and household flags                                                                                       |
| Unresolved               | Clears the reporting party's confirmation, leaves/reopens case; scripted progression cannot override it                                                                        |
| Forged events            | Generic endpoint permits only customer notes/emergency reports, not approvals, completion flags or service proof                                                               |
| Evidence truth           | Gnani/Gemini are LIVE_API only when their reviewed endpoints are actually called; Pine Labs/Delhivery wizard responses remain DOCUMENTATION_SIMULATION                         |
| Unsupported integrations | Default workflow rails stay mock; Gnani/Gemini require explicit enablement and backend keys; partner URL allowlists reject invented endpoints                                  |
| Audit                    | Decisions include rules; connector operations are allowlisted reference-only request/response logs                                                                             |
| Errors                   | No raw validation input or exception details reflected to clients; transaction rollback precedes denial audit                                                                  |

## Automated coordination limits

Nearest matching uses recorded coordinates only, excluding shops without a known distance; it is not live shop discovery or verified availability. The coordinator's provider responses, INR 1,500 offer, next-day UTC slot, and completion report are clearly labeled simulations. The customer must approve cost **and** timing together for the current offer/revision. Existing mock payment actions cannot bypass this requirement. Coordinator completion notifies the customer but never creates household verification or claims a physical visit. Provider role attribution remains spoofable; do not expose this service online. No real calls, location geocoding, background calling worker, live model, or external message delivery is implemented.

## Service schedule reminders

Customers or locally attributed providers can register provider-linked service dates. These are plans, not authorization to spend or a confirmed booking. A bounded local worker creates separate upcoming/due in-app reminders at startup and periodic checks; it never claims SMS/call/email delivery. Schedule revision/stage/audience uniqueness prevents duplicate reminders, and revision-bound edits/contact notes reject stale changes. Cancellation/rescheduling supersedes old reminders; retired assets are excluded. Provider contact records are unverified local text visible to the household, not evidence of an actual external contact. `X-Provider-ID` identifies a selected directory record but is spoofable, not authentication. The backend must be running for periodic checks; startup processes missed dates.

## Truth labels

- `LIVE_API`: server-reported response from an explicitly enabled Gnani STT or Gemini decision endpoint. A configured adapter that was not called is not live evidence.
- `REAL_HUMAN_INPUT`: an actual local form submission. This labels provenance, not proof of identity or correctness.
- `DOCUMENTATION_SIMULATION`: seeded examples, mock connectors, scripted approvals/confirmations, simulated evidence.
- `PROPOSED_CAPABILITY`: a future capability with no implemented integration or verified outcome.

A manually entered Pine Labs or Delhivery documentation response remains documentary, even though the request originated in a human click. Saved customer/provider chat text is `REAL_HUMAN_INPUT`; deterministic assistant text is `DOCUMENTATION_SIMULATION`, not live inference or a real provider response. A chat draft alone is not a case, and confirming it creates an unquoted local request, not a booking or payment. Closure in the demo means its rules passed on its labeled inputs—not that anyone really repaired a purifier.

## Emergency escalation

Emergency events flag human escalation and explicitly state no emergency dispatch or live assistance occurred. The application cannot diagnose a physical hazard or send emergency services. The user must contact local emergency services/qualified help directly. Model output is never authorized to improvise unsupported emergency actions.

## Data and identity

Use only demonstration data. Local signup requires affirmative consent and is not a mailing service. Arbitrary user notes are stored locally and not relayed to connectors. Credentials come only from environment settings and are excluded from dumps/repr. No frontend credential support exists.

The portal selector and header role selector are NOT login: portal choice is UI navigation, and `X-Demo-Role` is spoofable local attribution. Workspace mutations and chat/queue routes require the matching header for workflow attribution, but callers can choose the role and supply household/provider IDs themselves. Provider-thread checks scope messages to the assigned provider ID; they do not establish a provider's identity. Do not mistake this for access control. There is no household access-control boundary, cryptographic audit chain, signed evidence, retention enforcement, rate limit or abuse protection. CORS and localhost binding do not replace those systems. Never publish this backend as-is.

## Before real deployment

1. Authenticated provider/household identities, household-scoped authorization for every record, CSRF/session protections as applicable, and reset disabled outside demo.
2. Verified partner documentation/contracts, sandbox tests, explicit opt-in configuration, signed webhook handling, secret manager and key rotation.
3. Durable outbox/job queue, idempotency across retries, reconciliation and payment/refund/error handling. Local DB rollback cannot undo a real external payment.
4. Secure evidence upload, malware/type/size limits, provenance review, encrypted storage and household consent for any sensitive fields.
5. PostgreSQL migration and lock/isolation tests, backups/restore drills, monitoring, incident response and rate limiting.
6. Privacy notice, data minimization review, deletion/retention policies and applicable legal/payment compliance review.
7. Human escalation ownership and provider verification; no unsupported performance, coverage, market or safety claims.
