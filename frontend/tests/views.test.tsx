import { describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { assetFixture, installMockApi, json } from "./fixtures";
import { renderApp } from "./render";
import { installPortalMockApi } from "./portalMocks";
describe("portal and project views", () => {
  it.each([
    ["/customer", "A home that’s looked after."],
    ["/customer/home", "My Home"],
    ["/customer/chat", "Service chat"],
    ["/customer/cases", "Your cases"],
    ["/provider", "Provider Desk"],
    ["/project/cases", "Case Room"],
    ["/project/simulation", "The simulation lab"],
    ["/project/evidence", "Evidence Ledger"],
    ["/project/rails", "Rails & APIs"],
    ["/project/system-prompt", "System Prompt"],
    ["/project/business-plan", "The business behind the care."],
    ["/project/risks", "Risks & Safeguards"],
    ["/project/landing", /Your home has a lot/],
  ])("renders %s with the shared mock boundary", async (path, heading) => {
    const mock = installPortalMockApi();
    renderApp(path as string);
    expect(
      await screen.findByRole("heading", { level: 1, name: heading }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("MOCK / DEMO").length).toBeGreaterThan(0);
    expect(
      screen.getByText(/No real payments, bookings or outbound messages/),
    ).toBeVisible();
    await waitFor(() =>
      expect(screen.queryAllByText("Loading local records…")).toHaveLength(0),
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(
      mock.fetchMock.mock.calls.every(([url]) =>
        String(url).startsWith("/api/"),
      ),
    ).toBe(true);
  });
  it("keeps role-specific navigation within each portal", async () => {
    installMockApi();
    const user = userEvent.setup();
    const { unmount } = renderApp("/customer");
    const customerNav = screen.getByRole("navigation", {
      name: "customer navigation",
    });
    expect(
      within(customerNav).getByRole("link", { name: "My Home" }),
    ).toHaveAttribute("href", "/customer/home");
    expect(
      within(customerNav).getByRole("link", { name: "Service chat" }),
    ).toHaveAttribute("href", "/customer/chat");
    expect(
      within(customerNav).getByRole("link", { name: "My cases" }),
    ).toHaveAttribute("href", "/customer/cases");
    expect(
      within(customerNav).queryByRole("link", { name: "My queue" }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Open navigation" }));
    expect(
      screen.getByRole("button", { name: "Close navigation" }),
    ).toHaveAttribute("aria-expanded", "true");
    unmount();
    installPortalMockApi();
    renderApp("/provider");
    const providerNav = screen.getByRole("navigation", {
      name: "provider navigation",
    });
    expect(
      within(providerNav).getByRole("link", { name: "My queue" }),
    ).toHaveAttribute("href", "/provider");
    expect(
      within(providerNav).queryByRole("link", { name: "My cases" }),
    ).not.toBeInTheDocument();
    expect(
      within(providerNav).queryByRole("link", { name: "Service chat" }),
    ).not.toBeInTheDocument();
  });
  it("preserves asset notes, supplied complaint and household identity", async () => {
    installMockApi();
    renderApp("/customer/home");
    expect(await screen.findByText("Sangamesh")).toBeInTheDocument();
    expect(
      await screen.findByText("Keep the original asset note.", {
        selector: "p",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("Low water flow")).toBeInTheDocument();
    expect(
      screen.getByText("Kent / Original recorded model"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Warranty expiry (household-recorded)"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Next service (household-recorded)"),
    ).toBeInTheDocument();
    expect(screen.getByText("KENT-01")).toBeInTheDocument();
    expect(
      screen.getByText(
        /Dates are household-recorded and unverified; they do not confirm/,
      ),
    ).toBeInTheDocument();
  });
  it("offers all backend asset categories and submits the additional asset fields", async () => {
    const mock = installMockApi();
    const original = mock.fetchMock.getMockImplementation()!;
    const requests: { method: string; body: Record<string, unknown> }[] = [];
    mock.fetchMock.mockImplementation(async (input, init) => {
      if (
        (String(input) === "/api/assets" && init?.method === "POST") ||
        (String(input) === "/api/assets/ASSET-01" && init?.method === "PATCH")
      ) {
        requests.push({
          method: init!.method!,
          body: JSON.parse(String(init!.body)),
        });
        return json(assetFixture);
      }
      return original(input, init);
    });
    renderApp("/customer/home");
    const user = userEvent.setup();
    await screen.findByText("Keep the original asset note.", { selector: "p" });
    await user.click(screen.getByText("Add an appliance"));
    const category = screen.getByLabelText("Asset category");
    expect(within(category).getAllByRole("option")).toHaveLength(16);
    await user.selectOptions(category, "pest_control");
    await user.selectOptions(
      screen.getByLabelText("Appliance household"),
      "HH-01",
    );
    await user.type(screen.getByLabelText("Appliance name"), "Extractor fan");
    await user.type(screen.getByLabelText("Location in the home"), "Kitchen");
    await user.type(screen.getByLabelText("Installation date"), "2024-01-01");
    await user.type(
      screen.getByLabelText("Purchase date (optional)"),
      "2023-12-20",
    );
    await user.type(
      screen.getByLabelText("Warranty expiry (optional)"),
      "2026-12-20",
    );
    await user.type(
      screen.getByLabelText("Next service date (optional)"),
      "2026-06-01",
    );
    await user.type(screen.getByLabelText("Serial number (optional)"), "SER-1");
    await user.click(screen.getByRole("button", { name: "Save appliance" }));
    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0]).toMatchObject({
      method: "POST",
      body: {
        category: "pest_control",
        purchased_on: "2023-12-20",
        warranty_until: "2026-12-20",
        next_service_on: "2026-06-01",
        serial_number: "SER-1",
      },
    });
    await user.click(screen.getByText("Edit or retire this appliance"));
    expect(
      screen.getByLabelText("Recorded purchase date (optional)"),
    ).toHaveValue("2023-12-20");
    await user.clear(
      screen.getByLabelText("Recorded purchase date (optional)"),
    );
    await user.clear(
      screen.getByLabelText("Recorded serial number (optional)"),
    );
    await user.click(
      screen.getByRole("button", { name: "Save appliance changes" }),
    );
    await waitFor(() => expect(requests).toHaveLength(2));
    expect(requests[1]).toMatchObject({
      method: "PATCH",
      body: {
        purchased_on: null,
        warranty_until: "2026-12-20",
        next_service_on: "2026-06-01",
        serial_number: null,
      },
    });
    expect(requests[1].body).not.toHaveProperty("category");
    expect(requests[1].body).not.toHaveProperty("installed_on");
  });
  it("renders backend prompt verbatim instead of a frontend fallback", async () => {
    installMockApi();
    renderApp("/project/system-prompt");
    expect(
      await screen.findByLabelText("Backend system prompt"),
    ).toHaveTextContent(
      "Backend-owned instructions: preserve the human approval boundary.",
    );
  });
  it("offers direct microphone capture with an upload fallback", async () => {
    installMockApi();
    renderApp("/project/rails");
    const user = userEvent.setup();
    const record = await screen.findByRole("button", {
      name: "Record with microphone",
    });
    expect(screen.getByLabelText("Or upload an existing voice note")).toHaveAttribute(
      "accept",
      "audio/*",
    );
    await user.click(record);
    expect(screen.getByRole("alert")).toHaveTextContent(
      /does not support microphone recording/i,
    );
  });
  it("switches ledger sections and exposes request and response payloads", async () => {
    installMockApi();
    renderApp("/project/evidence?case=RK-2048");
    const user = userEvent.setup();
    expect(
      await screen.findByText("Documentary service record"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Source: mock service evidence/),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Decisions" }));
    expect(await screen.findByText("APPROVAL_REQUIRED")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Connector logs" }));
    await user.click(await screen.findByText("Inspect request and response"));
    expect(
      screen.getByRole("heading", { name: "Request" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Response" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/"real_spend": false/)).toBeVisible();
    expect(screen.getByText(/"amount": 749/)).toBeVisible();
  });
  it("creates a new complaint without changing the supplied demo story", async () => {
    const mock = installMockApi();
    renderApp("/customer/home?report=1");
    const user = userEvent.setup();
    await screen.findByText("Keep the original asset note.", { selector: "p" });
    await user.selectOptions(
      screen.getByLabelText("Which asset needs attention?"),
      "ASSET-01",
    );
    await user.type(
      screen.getByLabelText("Describe the problem in your own words"),
      "My original complaint: unusual noise after use.",
    );
    await user.click(screen.getByRole("button", { name: "Create local case" }));
    await screen.findByRole("heading", { name: "New complaint", level: 2 });
    expect(mock.posts[0]).toMatchObject({
      path: "/api/cases",
      body: {
        asset_id: "ASSET-01",
        complaint: "My original complaint: unusual noise after use.",
      },
    });
    expect(mock.state.item.complaint).toBe("Low water flow");
    expect(
      screen.getByRole("heading", { level: 1, name: "Your case" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "All cases" })).toHaveAttribute(
      "href",
      "/customer/cases",
    );
  });
  it("offers separate customer and provider portals from the root", async () => {
    installMockApi();
    renderApp("/");
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Your home, looked after.",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Open customer portal" }),
    ).toHaveAttribute("href", "/customer");
    expect(
      screen.getByRole("link", { name: "Open provider portal" }),
    ).toHaveAttribute("href", "/provider");
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  });
  it("shows a useful not-found route with a portal-choice link", async () => {
    installMockApi();
    renderApp("/missing");
    expect(
      screen.getByRole("heading", { name: "This room does not exist." }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Choose a portal" }),
    ).toHaveAttribute("href", "/");
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  });
});
