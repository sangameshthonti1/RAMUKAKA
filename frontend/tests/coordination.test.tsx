import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CoordinationPanel } from "../src/components/CoordinationPanel";
import { coordinationApi } from "../src/services/coordination";
import { api } from "../src/services/api";
import type { Coordination } from "../src/types/coordination";
import type { CaseDetail } from "../src/types/api";
import { caseFixture, timestamp } from "./fixtures";

const shop = {
  provider_id: "P-01",
  name: "Recorded test shop",
  shop_address: null,
  latitude: 12.98,
  longitude: 77.6,
  distance_km: 1.5,
};
const offer: Coordination = {
  case_id: "RK-AUTO",
  mode: "local_mock",
  real_calls_supported: false,
  state: {
    status: "awaiting_household_consent",
    offer_id: "O-01",
    provider_id: "P-01",
    service_revision: 2,
    total_cost_inr: 1500,
    timing: "Simulated test slot (UTC)",
    scheduled_start: timestamp,
    scheduled_end: timestamp,
    cost_approved: false,
    timing_approved: false,
    provider_response: "accepted",
    selected_shop: shop,
    distance_method: "haversine_straight_line_recorded_coordinates",
    messages: [
      {
        speaker: "provider",
        text: "Simulated provider acceptance",
        truth_label: "DOCUMENTATION_SIMULATION",
      },
    ],
  },
};
const item: CaseDetail = {
  ...caseFixture,
  id: "RK-AUTO",
  service_revision: 2,
  quote_amount: 1500,
};
function mount(party: "household" | "provider" = "household", supplied = item) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <CoordinationPanel item={supplied} party={party} />
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  vi.spyOn(api, "households").mockResolvedValue([
    {
      id: "HH-01",
      name: "Test household",
      address: null,
      latitude: 12.97,
      longitude: 77.59,
      participants: [],
      created_at: timestamp,
      updated_at: timestamp,
      truth_label: "REAL_HUMAN_INPUT",
    },
  ]);
  vi.spyOn(coordinationApi, "get").mockResolvedValue(structuredClone(offer));
});
afterEach(() => vi.restoreAllMocks());
describe("local automatic coordination", () => {
  it("requires both cost and timing before sending a scoped consent", async () => {
    const consent = vi.spyOn(coordinationApi, "consent").mockResolvedValue({
      ...offer,
      state: {
        ...offer.state,
        status: "assigned",
        cost_approved: true,
        timing_approved: true,
      },
    });
    mount();
    const user = userEvent.setup();
    const button = await screen.findByRole("button", {
      name: "Approve cost and timing & auto-assign (mock)",
    });
    expect(button).toBeDisabled();
    await user.click(screen.getByRole("checkbox", { name: /fixture total/ }));
    expect(button).toBeDisabled();
    expect(consent).not.toHaveBeenCalled();
    await user.click(
      screen.getByRole("checkbox", { name: /displayed simulated timing/ }),
    );
    await user.click(button);
    await waitFor(() =>
      expect(consent).toHaveBeenCalledWith("RK-AUTO", {
        offer_id: "O-01",
        approve_cost: true,
        approve_timing: true,
      }),
    );
  });
  it("automatically prepares one offer when saved coordinates and matching shops exist", async () => {
    vi.mocked(coordinationApi.get).mockResolvedValue(null);
    vi.spyOn(coordinationApi, "nearby").mockResolvedValue({
      source: "local_recorded_providers",
      distance_method: "haversine_straight_line_recorded_coordinates",
      unknown_distance_excluded: true,
      providers: [shop],
    });
    const start = vi.spyOn(coordinationApi, "start").mockResolvedValue(offer);
    mount("household", {
      ...item,
      provider_id: null,
      quote_amount: null,
      status: "awaiting_quote",
      service_revision: 1,
    });
    await waitFor(() => expect(start).toHaveBeenCalledWith("RK-AUTO", 1));
    expect(start).toHaveBeenCalledTimes(1);
    expect(
      screen.getByText(/no live search, external outreach, real call/),
    ).toBeInTheDocument();
  });
  it("keeps provider completion separate from household verification", async () => {
    const completed: Coordination = {
      ...offer,
      state: { ...offer.state, status: "provider_reported_completion" },
    };
    vi.mocked(coordinationApi.get).mockResolvedValue(completed);
    mount("provider", {
      ...item,
      assigned: true,
      status: "awaiting_confirmation",
      provider_confirmed: true,
    });
    expect(
      await screen.findByText(
        "Mock provider-reported completion — not household confirmation.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Household confirmation is still required/),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: "Report simulated completion (mock)",
      }),
    ).not.toBeInTheDocument();
  });
});
