export type TruthLabel =
  | "LIVE_API"
  | "REAL_HUMAN_INPUT"
  | "DOCUMENTATION_SIMULATION"
  | "PROPOSED_CAPABILITY";
export type AssetCategory =
  | "water_purifier"
  | "air_conditioner"
  | "refrigerator"
  | "washing_machine"
  | "dishwasher"
  | "microwave"
  | "geyser"
  | "fan"
  | "electrical"
  | "plumbing"
  | "carpentry"
  | "pest_control"
  | "furniture"
  | "lift"
  | "general"
  | "other";
export interface LocalRecord {
  updated_at: string;
  truth_label: TruthLabel;
}
export interface Participant extends LocalRecord {
  id: string;
  name: string;
  role: string;
  created_at: string;
}
export interface Household extends LocalRecord {
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  id: string;
  name: string;
  created_at: string;
  participants: Participant[];
}
export interface Asset extends LocalRecord {
  category: AssetCategory;
  id: string;
  household_id: string;
  name: string;
  brand: string;
  model: string;
  location: string;
  installed_on: string;
  purchased_on: string | null;
  warranty_until: string | null;
  next_service_on: string | null;
  serial_number: string | null;
  notes: string;
  status: string;
  created_at: string;
}
export interface CaseSummary {
  id: string;
  household_id: string;
  asset_id: string;
  title: string;
  complaint: string;
  service_category: AssetCategory;
  service_description: string | null;
  service_revision: number;
  assigned: boolean;
  status: string;
  quote_amount: number | null;
  provider_id: string | null;
  provider_confirmed: boolean;
  household_confirmed: boolean;
  created_at: string;
  updated_at: string;
}
export interface CaseEvent {
  id: string;
  case_id: string;
  type: string;
  title: string;
  detail: string;
  truth_label: TruthLabel;
  created_at: string;
}
export type ApprovalKind = "spend" | "change_provider" | "share_sensitive";
export interface Approval {
  id: string;
  case_id: string;
  kind: ApprovalKind;
  status: "pending" | "approved" | "rejected";
  amount: number | null;
  reason: string;
  created_at: string;
  updated_at: string;
}
export interface Evidence {
  kind: string;
  service_revision: number | null;
  provider_id: string | null;
  id: string;
  case_id: string;
  title: string;
  description: string;
  truth_label: TruthLabel;
  source: string;
  created_at: string;
}
export interface Decision {
  id: string;
  case_id: string;
  action: string;
  reason: string;
  rule: string;
  truth_label: TruthLabel;
  created_at: string;
}
export interface CaseDetail extends CaseSummary {
  events: CaseEvent[];
  approvals: Approval[];
  evidence: Evidence[];
  decisions: Decision[];
}
export interface ConnectorCall {
  id: string;
  case_id: string;
  connector: string;
  operation: string;
  request: Record<string, unknown>;
  response: Record<string, unknown>;
  truth_label: TruthLabel;
  status: string;
  created_at: string;
}
export interface Provider extends LocalRecord {
  shop_address: string | null;
  latitude: number | null;
  longitude: number | null;
  id: string;
  name: string;
  trade: string;
  status: string;
  created_at: string;
}
export interface Notification {
  id: string;
  case_id: string;
  channel: string;
  message: string;
  truth_label: TruthLabel;
  status: string;
  created_at: string;
}
export interface Rail {
  name: string;
  description: string;
  mode: string;
  truth_label: TruthLabel;
  operations: string[];
}
export interface PartnerRailContract {
  connector: "Gnani" | "Pine Labs" | "Delhivery";
  operation: string;
  method: string;
  endpoint: string;
  execution:
    | "live_api"
    | "documentation_simulation"
    | "wizard_documentation_input";
  truth_label: TruthLabel;
  documentation_url: string;
  ready: boolean;
  blocker: string | null;
}
export interface DocumentedRailResponse {
  connector: "Pine Labs" | "Delhivery";
  operation:
    | "create_payment_link"
    | "create_part_shipment"
    | "track_part_shipment";
  endpoint: string;
  documentation_url: string;
  request: Record<string, unknown>;
  response: Record<string, unknown>;
}
export interface SimulationState {
  step: number;
  total_steps: number;
  next_event: string | null;
  complete: boolean;
  case_id: string;
}
export interface Signup {
  name: string;
  email: string;
  consent: true;
}
export type CaseAction = "payment" | "share_sensitive" | "change_provider";
