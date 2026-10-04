import { ApiError, request } from "./api";
import type { Household, Provider } from "../types/api";
import type {
  Coordination,
  LocationInput,
  NearbyProviders,
} from "../types/coordination";

const path = (id: string) => `/cases/${encodeURIComponent(id)}`;
export const coordinationApi = {
  get: async (id: string): Promise<Coordination | null> => {
    try {
      return await request<Coordination>(`${path(id)}/coordination`);
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) return null;
      throw error;
    }
  },
  nearby: (id: string) =>
    request<NearbyProviders>(`${path(id)}/nearby-providers`),
  start: (id: string, expected_revision: number) =>
    request<Coordination>(`${path(id)}/coordination/start`, {
      expected_revision,
    }),
  consent: (
    id: string,
    body: { offer_id: string; approve_cost: boolean; approve_timing: boolean },
  ) => request<Coordination>(`${path(id)}/coordination/consent`, body),
  complete: (id: string, offer_id: string) =>
    request<Coordination>(`${path(id)}/coordination/mock-provider-response`, {
      offer_id,
      response: "complete",
    }),
  householdLocation: (id: string, body: LocationInput) =>
    request<Household>(
      `/households/${encodeURIComponent(id)}/location`,
      body,
      "PATCH",
    ),
  providerLocation: (id: string, body: LocationInput) =>
    request<Provider>(
      `/providers/${encodeURIComponent(id)}/location`,
      body,
      "PATCH",
    ),
};
