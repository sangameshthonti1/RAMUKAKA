import { vi } from "vitest";
import type {
  Asset,
  CaseDetail,
  ConnectorCall,
  Decision,
  Evidence,
  SimulationState,
} from "../src/types/api";
export const timestamp = "2026-01-15T10:00:00Z";
export const caseFixture: CaseDetail = {
  id: "RK-2048",
  household_id: "HH-01",
  asset_id: "ASSET-01",
  title: "Kent water purifier",
  complaint: "Low water flow",
  service_category: "water_purifier",
  service_description: "Filter replacement",
  service_revision: 1,
  assigned: false,
  status: "waiting_for_approval",
  quote_amount: 749,
  provider_id: "P-01",
  provider_confirmed: false,
  household_confirmed: false,
  created_at: timestamp,
  updated_at: timestamp,
  approvals: [
    {
      id: "A-01",
      case_id: "RK-2048",
      kind: "spend",
      status: "pending",
      amount: 749,
      reason: "Service inspection and repair quote",
      created_at: timestamp,
      updated_at: timestamp,
    },
  ],
  events: [
    {
      id: "EV-01",
      case_id: "RK-2048",
      type: "report",
      title: "Complaint recorded",
      detail: "Low water flow",
      truth_label: "DOCUMENTATION_SIMULATION",
      created_at: timestamp,
    },
  ],
  evidence: [],
  decisions: [],
};
export const assetFixture: Asset = {
  category: "water_purifier",
  truth_label: "DOCUMENTATION_SIMULATION",
  updated_at: timestamp,
  id: "ASSET-01",
  household_id: "HH-01",
  name: "Kent water purifier",
  brand: "Kent",
  model: "Original recorded model",
  location: "Kitchen",
  installed_on: "2024-01-01",
  purchased_on: "2023-12-20",
  warranty_until: "2026-12-20",
  next_service_on: "2026-06-01",
  serial_number: "KENT-01",
  notes: "Keep the original asset note.",
  status: "active",
  created_at: timestamp,
};
export const evidenceFixture: Evidence = {
  kind: "service",
  service_revision: 1,
  provider_id: "P-01",
  id: "E-01",
  case_id: "RK-2048",
  title: "Documentary service record",
  description: "Simulated flow check.",
  truth_label: "DOCUMENTATION_SIMULATION",
  source: "mock service evidence",
  created_at: timestamp,
};
export const decisionFixture: Decision = {
  id: "D-01",
  case_id: "RK-2048",
  action: "payment_denied",
  reason: "No approved spend",
  rule: "APPROVAL_REQUIRED",
  truth_label: "DOCUMENTATION_SIMULATION",
  created_at: timestamp,
};
export const connectorFixture: ConnectorCall = {
  id: "C-01",
  case_id: "RK-2048",
  connector: "mock_payment",
  operation: "pay",
  request: { amount: 749 },
  response: { status: "mock_only", real_spend: false },
  truth_label: "DOCUMENTATION_SIMULATION",
  status: "success",
  created_at: timestamp,
};
export function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
export function installMockApi() {
  const state = {
    item: structuredClone(caseFixture),
    simulation: {
      step: 0,
      total_steps: 6,
      next_event: "customer_approval",
      complete: false,
      case_id: "RK-2048",
    } as SimulationState,
    extraCases: [] as CaseDetail[],
    signupCount: 0,
  };
  const posts: {
    path: string;
    body: Record<string, unknown>;
    headers: HeadersInit | undefined;
  }[] = [];
  const fetchMock = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const path = String(input);
      if (!path.startsWith("/api/"))
        throw new Error(`Non-local request: ${path}`);
      if (init?.method === "POST") {
        const body = JSON.parse(String(init.body)) as Record<string, unknown>;
        posts.push({ path, body, headers: init.headers });
        if (path === "/api/signup") {
          state.signupCount++;
          return json(
            { id: "SIGNUP-1", message: "Saved to the local demo only." },
            201,
          );
        }
        if (path === "/api/simulation/next") {
          if (state.item.approvals[0].status === "rejected")
            return json(
              { detail: "Rejected approvals block simulation progression." },
              409,
            );
          state.simulation.step++;
          state.simulation.complete = state.simulation.step >= 6;
          state.simulation.next_event = state.simulation.complete
            ? null
            : "provider_assignment";
          state.item.approvals[0].status = "approved";
          state.item.status = "approved";
          return json(state.simulation);
        }
        if (path === "/api/simulation/reset") {
          state.item = structuredClone(caseFixture);
          state.simulation = {
            step: 0,
            total_steps: 6,
            next_event: "customer_approval",
            complete: false,
            case_id: "RK-2048",
          };
          return json(state.simulation);
        }
        if (path === "/api/agent/RK-2048/decide") {
          const decision: Decision = {
            id: "D-GEMINI",
            case_id: "RK-2048",
            action: "request_household_approval",
            reason: "The current quote still needs consent.",
            rule: "APPROVAL_REQUIRED",
            truth_label: "LIVE_API",
            created_at: timestamp,
          };
          return json(
            {
              case_id: "RK-2048",
              model: "gemini-3.8-flash",
              status: "live_succeeded",
              decision,
              notification: {
                id: "N-GEMINI",
                case_id: "RK-2048",
                channel: "in_app:household",
                message: "Please approve or reject the ₹749 quote.",
                truth_label: "LIVE_API",
                status: "displayed",
                created_at: timestamp,
              },
              connector_call: {
                id: "C-GEMINI",
                case_id: "RK-2048",
                connector: "Gemini",
                operation: "decide_next_action",
                request: {},
                response: {},
                truth_label: "LIVE_API",
                status: "live_succeeded",
                created_at: timestamp,
              },
            },
            201,
          );
        }
        if (path === "/api/cases") {
          const item = {
            ...structuredClone(caseFixture),
            id: "RK-NEW",
            title: "New complaint",
            complaint: String(body.complaint),
            status: "reported",
            approvals: [],
            events: [],
          };
          state.extraCases.push(item);
          return json(item, 201);
        }
        if (path.endsWith("/approvals")) {
          const approval = state.item.approvals.find(
            (item) => item.kind === body.kind,
          );
          if (approval)
            approval.status = body.decision as "approved" | "rejected";
          state.item.status =
            body.decision === "approved" ? "approved" : "approval_rejected";
          return json(state.item);
        }
        if (path.endsWith("/approval-requests")) {
          state.item.approvals.push({
            id: "A-02",
            case_id: state.item.id,
            kind: body.kind as "change_provider" | "share_sensitive",
            reason: String(body.reason),
            status: "pending",
            amount: null,
            created_at: timestamp,
            updated_at: timestamp,
          });
          return json(state.item);
        }
        if (path.endsWith("/actions"))
          return json(
            { detail: "Spend approval required. No real payment was made." },
            403,
          );
        if (path.endsWith("-confirmation")) {
          if (body.confirmed && !state.item.evidence.length)
            return json(
              {
                detail:
                  "Provider assignment and service evidence required before confirmation.",
              },
              409,
            );
          if (path.endsWith("/provider-confirmation"))
            state.item.provider_confirmed = Boolean(body.confirmed);
          else state.item.household_confirmed = Boolean(body.confirmed);
          state.item.status = body.confirmed ? "in_service" : "unresolved";
          return json(state.item);
        }
        if (path.endsWith("/events")) {
          state.item.events.push({
            id: "EV-NEW",
            case_id: state.item.id,
            type: String(body.type),
            title: "Household note added",
            detail: String(body.detail),
            truth_label: "REAL_HUMAN_INPUT",
            created_at: timestamp,
          });
          return json(state.item);
        }
        throw new Error(`Unhandled POST ${path}`);
      }
      const routes: Record<string, unknown> = {
        "/api/cases": [state.item, ...state.extraCases],
        "/api/cases/RK-2048": state.item,
        "/api/assets": [assetFixture],
        "/api/assets/ASSET-01": { asset: assetFixture, cases: [state.item] },
        "/api/households": [
          {
            id: "HH-01",
            name: "Sangamesh’s home",
            created_at: timestamp,
            participants: [
              {
                id: "PERSON-01",
                name: "Sangamesh",
                role: "household",
                created_at: timestamp,
              },
            ],
          },
        ],
        "/api/providers": [
          {
            id: "P-01",
            name: "Demo provider one",
            trade: "Water purifier service",
            status: "active",
            created_at: timestamp,
          },
          {
            id: "P-02",
            name: "Demo provider two",
            trade: "Appliance service",
            status: "active",
            created_at: timestamp,
          },
        ],
        "/api/evidence": [evidenceFixture],
        "/api/decisions": [decisionFixture],
        "/api/connectors": [connectorFixture],
        "/api/notifications": [],
        "/api/rails": [
          {
            name: "Mock payment rail",
            description: "No real spend.",
            mode: "mock",
            truth_label: "DOCUMENTATION_SIMULATION",
            operations: ["payment"],
          },
        ],
        "/api/partner-rails/contracts": [
          {
            connector: "Gnani",
            operation: "transcribe_audio",
            method: "POST",
            endpoint: "https://api.vachana.ai/stt/v3",
            execution: "live_api",
            truth_label: "LIVE_API",
            documentation_url: "https://www.gnani.ai/speech-to-text-api",
            ready: false,
            blocker: "Set the local key.",
          },
          {
            connector: "Pine Labs",
            operation: "create_payment_link",
            method: "POST",
            endpoint:
              "https://pluraluat.v2.pinepg.in/api/pay/v1/paymentlink",
            execution: "documentation_simulation",
            truth_label: "DOCUMENTATION_SIMULATION",
            documentation_url:
              "https://www.pinelabs.com/docs/online-payments/api/payment-links/create-payment-link",
            ready: true,
            blocker: null,
          },
        ],
        "/api/agent/contract": {
          provider: "gemini",
          model: "gemini-3.8-flash",
          ready: true,
          blocker: null,
        },
        "/api/system-prompt": {
          prompt:
            "Backend-owned instructions: preserve the human approval boundary.",
        },
        "/api/simulation": state.simulation,
      };
      const extra = state.extraCases.find(
        (item) => path === `/api/cases/${item.id}`,
      );
      if (extra) return json(extra);
      if (!(path in routes)) return json({ detail: "Case not found." }, 404);
      return json(routes[path]);
    },
  );
  vi.stubGlobal("fetch", fetchMock);
  return { fetchMock, posts, state };
}
