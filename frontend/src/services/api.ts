import { getDemoRole } from "../store/demo";
import type {
  ApprovalKind,
  Asset,
  CaseAction,
  CaseDetail,
  CaseSummary,
  ConnectorCall,
  Decision,
  Evidence,
  Household,
  Notification,
  Provider,
  Rail,
  Signup,
  SimulationState,
} from "../types/api";
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}
function errorDetail(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value))
    return value
      .map((item) => {
        if (item && typeof item === "object" && "msg" in item)
          return String(item.msg);
        return "Invalid input";
      })
      .join("; ");
  return "The request could not be completed.";
}
export async function request<T>(
  path: string,
  body?: unknown,
  method: "POST" | "PATCH" = "POST",
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method: body === undefined ? "GET" : method,
      headers: {
        Accept: "application/json",
        "X-Demo-Role": getDemoRole(),
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch {
    throw new ApiError(
      0,
      "Cannot reach the local backend. Check that it is running and retry.",
    );
  }
  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new ApiError(
      response.status,
      "The server did not return JSON. Check the API proxy and backend.",
    );
  }
  if (!response.ok) {
    const detail =
      data && typeof data === "object" && "detail" in data
        ? data.detail
        : undefined;
    throw new ApiError(response.status, errorDetail(detail));
  }
  return data as T;
}
const casePath = (id: string) => `/cases/${encodeURIComponent(id)}`;
export const api = {
  households: () => request<Household[]>("/households"),
  assets: () => request<Asset[]>("/assets"),
  asset: (id: string) =>
    request<{ asset: Asset; cases: CaseSummary[] }>(
      `/assets/${encodeURIComponent(id)}`,
    ),
  cases: () => request<CaseSummary[]>("/cases"),
  case: (id: string) => request<CaseDetail>(casePath(id)),
  createCase: (body: { asset_id: string; complaint: string }) =>
    request<CaseDetail>("/cases", body),
  event: (
    id: string,
    body: { type: "customer_note" | "emergency"; detail: string },
  ) => request<CaseDetail>(`${casePath(id)}/events`, body),
  approval: (
    id: string,
    kind: ApprovalKind,
    decision: "approved" | "rejected",
  ) => request<CaseDetail>(`${casePath(id)}/approvals`, { kind, decision }),
  approvalRequest: (
    id: string,
    body: {
      kind: "change_provider" | "share_sensitive";
      reason: string;
      target_provider_id?: string;
    },
  ) => request<CaseDetail>(`${casePath(id)}/approval-requests`, body),
  action: (id: string, action: CaseAction) =>
    request<CaseDetail>(`${casePath(id)}/actions`, { action }),
  confirmation: (
    id: string,
    party: "provider" | "household",
    body: { confirmed: boolean; note: string },
  ) => request<CaseDetail>(`${casePath(id)}/${party}-confirmation`, body),
  evidence: () => request<Evidence[]>("/evidence"),
  decisions: () => request<Decision[]>("/decisions"),
  connectors: () => request<ConnectorCall[]>("/connectors"),
  providers: () => request<Provider[]>("/providers"),
  notifications: () => request<Notification[]>("/notifications"),
  rails: () => request<Rail[]>("/rails"),
  prompt: () => request<{ prompt: string }>("/system-prompt"),
  simulation: () => request<SimulationState>("/simulation"),
  next: () => request<SimulationState>("/simulation/next", {}),
  reset: () => request<SimulationState>("/simulation/reset", {}),
  signup: (body: Signup) =>
    request<{ id: string; message: string }>("/signup", body),
};
