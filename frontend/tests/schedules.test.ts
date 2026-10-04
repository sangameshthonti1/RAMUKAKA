import { describe, expect, it, vi } from "vitest";
import { schedulesApi } from "../src/services/schedules";
import { json } from "./fixtures";

describe("provider-linked service schedule client", () => {
  it("sends explicit provider attribution when the company registers a service date", async () => {
    const mock = vi.mocked(fetch).mockResolvedValue(json({ id: "S-01" }, 201));
    const body = {
      household_id: "HH-01",
      asset_id: "ASSET-01",
      provider_id: "P-01",
      next_service_on: "2026-11-01",
      note: "Annual maintenance",
    };
    await schedulesApi.create({ audience: "provider", id: "P-01" }, body);
    expect(mock).toHaveBeenCalledWith("/api/service-schedules", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-Demo-Role": "provider",
        "X-Provider-ID": "P-01",
      },
      body: JSON.stringify(body),
    });
  });
  it("uses revision-bound rescheduling and customer attribution without inventing identity headers", async () => {
    const mock = vi
      .mocked(fetch)
      .mockResolvedValue(json({ id: "S-01", revision: 2 }));
    const body = {
      expected_revision: 1,
      next_service_on: "2026-12-01",
      status: "active" as const,
    };
    await schedulesApi.edit(
      { audience: "household", id: "HH-01" },
      "S-01",
      body,
    );
    expect(mock).toHaveBeenCalledWith("/api/service-schedules/S-01", {
      method: "PATCH",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-Demo-Role": "household",
      },
      body: JSON.stringify(body),
    });
  });
  it("loads reminders separately for the selected household and provider", async () => {
    const mock = vi.mocked(fetch).mockImplementation(async () => json([]));
    await schedulesApi.reminders({ audience: "household", id: "HH-01" });
    await schedulesApi.reminders({ audience: "provider", id: "P-01" });
    expect(mock.mock.calls.map(([url]) => url)).toEqual([
      "/api/households/HH-01/service-reminders?limit=200&offset=0",
      "/api/providers/P-01/service-reminders?limit=200&offset=0",
    ]);
  });
  it("preserves stale-schedule errors rather than pretending a reminder or message was delivered", async () => {
    vi.mocked(fetch).mockResolvedValue(
      json(
        { detail: "Schedule changed; reload and use the current revision" },
        409,
      ),
    );
    await expect(
      schedulesApi.contact({ audience: "provider", id: "P-01" }, "S-01", {
        expected_revision: 1,
        kind: "local_message",
        content: "Please arrange a service time.",
      }),
    ).rejects.toMatchObject({
      status: 409,
      message: expect.stringContaining("Schedule changed"),
    });
  });
});
