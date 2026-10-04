import type { TruthLabel } from "./api";

export interface LocationInput {
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}
export interface RecordedShop {
  provider_id: string;
  name: string;
  shop_address: string | null;
  latitude: number;
  longitude: number;
  distance_km: number;
}
export interface NearbyProviders {
  source: "local_recorded_providers";
  distance_method: "haversine_straight_line_recorded_coordinates";
  unknown_distance_excluded: true;
  providers: RecordedShop[];
}
// State fields are produced by services/coordination.py; the API wraps them in a dict.
export interface Coordination {
  case_id: string;
  mode: "local_mock";
  real_calls_supported: false;
  state: {
    status:
      | "awaiting_household_consent"
      | "assigned"
      | "provider_reported_completion";
    offer_id: string;
    provider_id: string;
    service_revision: number;
    total_cost_inr: number;
    timing: string;
    scheduled_start: string;
    scheduled_end: string;
    cost_approved: boolean;
    timing_approved: boolean;
    provider_response: "accepted" | "declined";
    selected_shop: RecordedShop;
    distance_method: "haversine_straight_line_recorded_coordinates";
    messages: { speaker: string; text: string; truth_label: TruthLabel }[];
  };
}
