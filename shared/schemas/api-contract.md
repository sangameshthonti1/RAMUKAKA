# Implementation contract

All endpoints below return JSON. API prefix `/api`; health `/health`. Local-only demonstration with no external side effects. Demo role headers are UX/test attribution, NOT production authentication. All records carry id and created_at; mutable records updated_at/status as appropriate. Amounts in whole INR for this demo. TruthLabel is LIVE_API | REAL_HUMAN_INPUT | DOCUMENTATION_SIMULATION | PROPOSED_CAPABILITY.

- GET /health -> {status: 'ok', connector_mode: 'mock'}
- GET /api/households -> Household[] {id,name,created_at,participants:[{id,name,role,created_at}]}
- GET /api/assets -> Asset[] {id,household_id,name,category,brand,model,location,installed_on,purchased_on,warranty_until,next_service_on,serial_number,notes,status,created_at}. Optional dates/serial are unverified household records, not warranty proof, appointments or verified service.
- GET /api/assets/{id} -> {asset:Asset,cases:CaseSummary[]}
- POST /api/households {name,member_name} -> Household (201); POST /api/households/{id}/participants {name} -> Household (201).
- POST /api/assets {household_id,name,category,brand?,model?,location,installed_on,notes?,purchased_on?,warranty_until?,next_service_on?,serial_number?} -> Asset (201); PATCH /api/assets/{id} {name,brand,model,location,notes,status:'active'|'retired',purchased_on?,warranty_until?,next_service_on?,serial_number?} -> Asset. Retiring with open cases -> 409. Categories include water_purifier, air_conditioner, refrigerator, washing_machine, dishwasher, microwave, geyser, fan, electrical, plumbing, carpentry, pest_control, furniture, lift, general and other; see OpenAPI for authoritative values.
- GET /api/cases -> CaseSummary[]
- POST /api/cases body {asset_id,complaint} -> CaseDetail (201)
- GET /api/cases/{id} -> CaseDetail
- CaseSummary {id,household_id,asset_id,title,complaint,service_category,service_description,service_revision,assigned,status,quote_amount,provider_id,provider_confirmed,household_confirmed,created_at,updated_at}
- CaseDetail extends CaseSummary with {events:CaseEvent[],approvals:Approval[],evidence:Evidence[],decisions:Decision[]}
- CaseEvent {id,case_id,type,title,detail,truth_label,created_at}
- Approval {id,case_id,kind:'spend'|'change_provider'|'share_sensitive',status:'pending'|'approved'|'rejected',amount:number|null,reason,created_at,updated_at}
- Decision {id,case_id,action,reason,rule,truth_label,created_at}
- Evidence {id,case_id,title,description,truth_label,source,kind,service_revision,provider_id,created_at}
- ConnectorCall {id,case_id,connector,operation,request:object,response:object,truth_label,status,created_at}
- Household/Participant/Asset/Provider additionally include updated_at and truth_label.
- Provider {id,name,trade,status,created_at,updated_at,truth_label}. POST /api/providers {name,trade} -> Provider (201); PATCH /api/providers/{id} {name,status:'available'|'unavailable'} -> Provider.
- Notification {id,case_id,channel,message,truth_label,status,created_at}
- POST /api/cases/{id}/quote {provider_id,amount,service_description,expected_revision} -> CaseDetail. New non-demo cases start awaiting_quote with no quote/approval. Requotes invalidate unused permissions; changing selected provider requires separate scoped approval. Quote forbidden on assigned, cancelled, closed or documentary RK-2048.
- POST /api/cases/{id}/service-reports {provider_id,expected_revision,work_performed,observed_result} -> CaseDetail (201). Requires approved assigned service and matching provider/revision. Evidence truth_label REAL_HUMAN_INPUT; provenance is an unverified local provider claim. New report clears earlier confirmations.
- POST /api/cases/{id}/cancel {reason} -> CaseDetail. Household can cancel only unassigned non-demo cases, revoke unused authorizations, and preserve history/status cancelled (never closed).
- New workspace-write endpoints require a matching X-Demo-Role header (household or provider); this is attribution only and is spoofable. No internet-facing authorization is implemented.
- POST /api/cases/{id}/events body {type:'customer_note'|'emergency',detail} -> CaseDetail. Generic events may NOT bypass the state machine or forge confirmation/evidence.
- POST /api/cases/{id}/approvals body {kind:'spend'|'change_provider'|'share_sensitive',decision:'approved'|'rejected'} -> CaseDetail. Resolves an existing pending approval. Does NOT accept arbitrary amount or fabricate an approval.
- POST /api/cases/{id}/approval-requests body {kind:'change_provider'|'share_sensitive',reason,target_provider_id?:string} -> CaseDetail. Creates a scoped request; only requested target/provider or fixed minimal share payload can be used after approval.
- POST /api/cases/{id}/actions body {action:'payment'|'share_sensitive'|'change_provider'} -> CaseDetail. Backend enforces approved scope, consumes authorization/idempotency, logs mock connector. Forbidden -> 403; invalid state -> 409.
- POST /api/cases/{id}/provider-confirmation body {confirmed:boolean,note:string} -> CaseDetail
- POST /api/cases/{id}/household-confirmation same body -> CaseDetail
- GET /api/decisions -> Decision[]
- GET /api/evidence -> Evidence[]
- GET /api/connectors -> ConnectorCall[]
- GET /api/providers -> Provider[]
- GET /api/notifications -> Notification[]
- GET /api/providers/{provider_id}/queue -> CaseSummary[] for this selected local provider (provider role); includes matching unassigned requests and its assigned cases. Local attribution is not identity verification.
- GET /api/chat/conversations?household_id=... -> ConversationSummary[] (household role); POST /api/chat/conversations {household_id} -> ConversationDetail (201). GET /api/chat/conversations/{id} -> ConversationDetail with persisted messages.
- POST /api/chat/conversations/{id}/messages {text,action:'message'|'confirm_report'|'cancel_report',asset_id?:string} -> ConversationDetail. An active asset, complaint and explicit confirm_report are required before a case is created. Assistant messages are deterministic documentation simulations; customer text is local real human input.
- GET /api/chat/cases/{case_id}/conversations?provider_id=... -> ConversationDetail[]; POST /api/chat/conversations/{id}/provider-messages {provider_id,text} -> ConversationDetail. Both require provider attribution and a matching assigned provider; the role header is spoofable and does not provide tenant isolation.
- GET /api/rails -> Rail[] {name,description,mode,truth_label,operations:string[]}
- GET /api/system-prompt -> {prompt:string}
- POST /api/signup body {name,email,consent:true} -> {id,message} (201). Only stored locally. No outbound delivery.
- GET /api/simulation -> {step:number,total_steps:number,next_event:string|null,complete:boolean,case_id:'RK-2048'}
- POST /api/simulation/next -> same SimulationState
- POST /api/simulation/reset -> same SimulationState

Seed is RK-2048, Sangamesh, Kent water purifier, Low water flow, quote 749, status waiting_for_approval. Initial timeline has 6 documentary events: report, classification, asset history, provider selection, quote, approval request. Simulation next progresses through: customer approval, provider assignment (mock payment allowed only after approval), service evidence, provider completion, household confirmation, final closure (6 additional events). Manual second-party confirmation closes when service evidence and assignment exist; simulation defers closure to the explicit final event. Both paths must use the same closure guard. Confirmation before service evidence or without approved service must be rejected. Negative confirmation clears that party's flag and reopens a closed case. Rejected approvals block simulation progression (409), not silently reapprove. Simulation actions always DOCUMENTATION_SIMULATION; actual local form submissions REAL_HUMAN_INPUT. Reset replaces ONLY demo-scoped records, leaving signup and unrelated cases intact.

Errors: FastAPI {detail:string|validationErrors[]} with suitable HTTP status. Dates ISO 8601 UTC. No secrets in logs. No arbitrary request/response logging of user-supplied sensitive text. CORS local frontend origin only. Vite proxy `/api` and `/health` to localhost:8000. UI uses same-origin relative URLs.
