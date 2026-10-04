import { request } from "./api";
import type {
  Asset,
  AssetCategory,
  CaseDetail,
  Household,
  Provider,
} from "../types/api";

export type AssetInput = Pick<
  Asset,
  | "household_id"
  | "name"
  | "category"
  | "brand"
  | "model"
  | "location"
  | "installed_on"
  | "notes"
>;
export type AssetEdit = Pick<
  Asset,
  "name" | "brand" | "model" | "location" | "notes"
> & { status: "active" | "retired" };
export const workspaceApi = {
  createHousehold: (body: { name: string; member_name: string }) =>
    request<Household>("/households", body),
  addParticipant: (id: string, body: { name: string }) =>
    request<Household>(
      `/households/${encodeURIComponent(id)}/participants`,
      body,
    ),
  createAsset: (body: AssetInput) => request<Asset>("/assets", body),
  editAsset: (id: string, body: AssetEdit) =>
    request<Asset>(`/assets/${encodeURIComponent(id)}`, body, "PATCH"),
  createProvider: (body: { name: string; trade: AssetCategory }) =>
    request<Provider>("/providers", body),
  editProvider: (
    id: string,
    body: { name: string; status: "available" | "unavailable" },
  ) => request<Provider>(`/providers/${encodeURIComponent(id)}`, body, "PATCH"),
  cancelCase: (id: string, body: { reason: string }) =>
    request<CaseDetail>(`/cases/${encodeURIComponent(id)}/cancel`, body),
  quote: (
    id: string,
    body: {
      provider_id: string;
      amount: number;
      service_description: string;
      expected_revision: number;
    },
  ) => request<CaseDetail>(`/cases/${encodeURIComponent(id)}/quote`, body),
  serviceReport: (
    id: string,
    body: {
      provider_id: string;
      expected_revision: number;
      work_performed: string;
      observed_result: string;
      proof_file_name: string;
      proof_media_type: string;
      proof_size_bytes: number;
      proof_sha256: string;
      proof_captured_at: string;
    },
  ) =>
    request<CaseDetail>(
      `/cases/${encodeURIComponent(id)}/service-reports`,
      body,
    ),
};
