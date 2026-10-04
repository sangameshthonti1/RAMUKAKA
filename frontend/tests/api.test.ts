import { describe, expect, it, vi } from "vitest";
import { api, request } from "../src/services/api";
import { setDemoRole } from "../src/store/demo";
import { json } from "./fixtures";
describe("same-origin typed API service", () => {
  it("uses relative URLs, explicit JSON and local demo attribution only", async () => {
    const fetchMock = vi.mocked(fetch).mockResolvedValue(json({ id: "local" }));
    setDemoRole("provider");
    await api.confirmation("RK-2048", "provider", {
      confirmed: false,
      note: "Unresolved.",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/cases/RK-2048/provider-confirmation",
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "X-Demo-Role": "provider",
        },
        body: JSON.stringify({ confirmed: false, note: "Unresolved." }),
      },
    );
  });
  it("turns FastAPI validation errors into readable field feedback without logging raw input", async () => {
    vi.mocked(fetch).mockResolvedValue(
      json(
        {
          detail: [
            {
              loc: ["body", "email"],
              msg: "Enter a valid email address",
              input: "not echoed",
            },
          ],
        },
        422,
      ),
    );
    await expect(
      api.signup({ name: "Person", email: "invalid", consent: true }),
    ).rejects.toMatchObject({
      status: 422,
      message: "Enter a valid email address",
    });
  });
  it("preserves server permission errors", async () => {
    vi.mocked(fetch).mockResolvedValue(
      json({ detail: "Approval required" }, 403),
    );
    await expect(api.action("RK-2048", "payment")).rejects.toMatchObject({
      status: 403,
      message: "Approval required",
    });
  });
  it("explains network failures without using mock fallback data", async () => {
    vi.mocked(fetch).mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(api.cases()).rejects.toMatchObject({
      status: 0,
      message: expect.stringContaining("Cannot reach the local backend"),
    });
  });
  it("detects a misconfigured proxy returning HTML", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response("<html>not JSON</html>"));
    await expect(request("/cases")).rejects.toThrow(
      "The server did not return JSON",
    );
  });
});
