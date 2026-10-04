import { describe, expect, it } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { installMockApi, evidenceFixture, json } from "./fixtures";
import { renderApp } from "./render";
import { installPortalMockApi } from "./portalMocks";
import { keys } from "../src/hooks/useApi";
describe("human decisions and server guard feedback", () => {
  it("attaches a reviewed live transcript only to the explicitly selected case", async () => {
    const mock = installMockApi();
    const original = mock.fetchMock.getMockImplementation()!;
    mock.fetchMock.mockImplementation(async (input, init) => {
      if (
        String(input) === "/api/partner-rails/RK-2048/gnani/transcribe" &&
        init?.method === "POST"
      ) {
        expect(init.body).toBeInstanceOf(FormData);
        return json({
          id: "GNANI-1",
          case_id: "RK-2048",
          connector: "Gnani",
          operation: "transcribe_audio",
          request: {},
          response: {
            parsed_response: { transcript: "मेरा टीवी खराब हो गया है" },
          },
          truth_label: "LIVE_API",
          status: "live_succeeded",
          created_at: "2026-10-04T09:44:06Z",
        });
      }
      return original(input, init);
    });
    renderApp("/project/rails");
    const user = userEvent.setup();
    await user.selectOptions(
      await screen.findByLabelText("Target case and appliance"),
      "RK-2048",
    );
    const audio = new File(["voice"], "voice.ogg", { type: "audio/ogg" });
    const fileInput = screen.getByLabelText("Or upload an existing voice note");
    await user.upload(fileInput, audio);
    expect((fileInput as HTMLInputElement).files?.[0]).toBe(audio);
    const send = screen.getByRole("button", { name: "Send voice note to Gnani" });
    expect(send).toBeEnabled();
    await user.click(send);
    expect(await screen.findByText("मेरा टीवी खराब हो गया है")).toBeInTheDocument();
    expect(mock.posts).toHaveLength(0);
    await user.click(
      screen.getByRole("button", { name: "Confirm and attach to RK-2048" }),
    );
    await screen.findByText(/Transcript added as real human input/);
    expect(mock.posts[0]).toMatchObject({
      path: "/api/cases/RK-2048/events",
      body: { type: "customer_note", detail: "मेरा टीवी खराब हो गया है" },
    });
  });

  it.each(["approved", "rejected"] as const)(
    "submits a scoped ₹749 %s decision and globally invalidates caches",
    async (decision) => {
      const mock = installMockApi();
      const { client } = renderApp("/customer/cases/RK-2048");
      const user = userEvent.setup();
      client.setQueryData(keys.connectors, []);
      client.setQueryData(keys.rails, []);
      const button = await screen.findByRole("button", {
        name: decision === "approved" ? "Approve ₹749" : "Reject ₹749",
      });
      await user.click(button);
      await waitFor(() => expect(mock.posts).toHaveLength(1));
      expect(mock.posts[0]).toMatchObject({
        path: "/api/cases/RK-2048/approvals",
        body: { kind: "spend", decision },
      });
      expect(mock.posts[0].body).not.toHaveProperty("amount");
      await waitFor(() =>
        expect(
          screen.queryByRole("button", { name: "Approve ₹749" }),
        ).not.toBeInTheDocument(),
      );
      expect(client.getQueryState(keys.connectors)?.isInvalidated).toBe(true);
      expect(client.getQueryState(keys.rails)?.isInvalidated).toBe(true);
    },
  );
  it("calls the actual API guard for mock payment and surfaces 403 without pretending success", async () => {
    const mock = installMockApi();
    const { client } = renderApp("/project/cases/RK-2048");
    const user = userEvent.setup();
    client.setQueryData(keys.decisions, []);
    await user.click(
      await screen.findByRole("button", { name: "Try mock payment" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent("403");
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Spend approval required. No real payment was made.",
    );
    expect(mock.posts[0].body).toEqual({ action: "payment" });
    await waitFor(() =>
      expect(client.getQueryState(keys.decisions)?.isInvalidated).toBe(true),
    );
  });
  it("explains confirmation prerequisites and displays a backend 409", async () => {
    installMockApi();
    renderApp("/project/cases/RK-2048");
    const user = userEvent.setup();
    await screen.findByLabelText("Confirmation note", {
      selector: "#provider-note",
    });
    expect(
      screen.getAllByText(
        /Requires approved service, provider assignment and service evidence/,
      ),
    ).toHaveLength(2);
    await user.selectOptions(
      screen.getByLabelText(/Demo attribution/),
      "provider",
    );
    await user.type(
      screen.getByLabelText("Confirmation note", {
        selector: "#provider-note",
      }),
      "I checked the unit.",
    );
    await user.click(
      screen.getByRole("button", { name: "Submit provider confirmation" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent("409");
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Provider assignment and service evidence required",
    );
  });
  it.each(["provider", "household"] as const)(
    "submits true and unresolved %s assessments with explicit demo attribution",
    async (party) => {
      const mock = installMockApi();
      mock.state.item.evidence = [evidenceFixture];
      renderApp("/project/cases/RK-2048");
      const user = userEvent.setup();
      await screen.findByRole("heading", { name: "Close the loop" });
      await user.selectOptions(
        screen.getByLabelText(/Demo attribution/),
        party,
      );
      await user.type(
        screen.getByLabelText("Confirmation note", {
          selector: `#${party}-note`,
        }),
        "My own observation.",
      );
      await user.click(
        screen.getByRole("button", { name: `Submit ${party} confirmation` }),
      );
      await screen.findByText(
        "Assessment recorded. Check the updated case status and timeline.",
      );
      expect(mock.posts[0]).toMatchObject({
        path: `/api/cases/RK-2048/${party}-confirmation`,
        body: { confirmed: true, note: "My own observation." },
        headers: { "X-Demo-Role": party },
      });
      await user.selectOptions(
        screen.getByLabelText("Your assessment", {
          selector: `#${party}-result`,
        }),
        "false",
      );
      await user.click(
        screen.getByRole("button", {
          name: `Submit ${party} unresolved report`,
        }),
      );
      await waitFor(() => expect(mock.posts).toHaveLength(2));
      expect(mock.posts[1].body).toEqual({
        confirmed: false,
        note: "My own observation.",
      });
    },
  );
  it.each(["change_provider", "share_sensitive"] as const)(
    "creates a scoped %s approval request without arbitrary sharing data",
    async (kind) => {
      const mock = installMockApi();
      renderApp("/project/cases/RK-2048");
      const user = userEvent.setup();
      await user.click(
        await screen.findByText(
          "Request a provider change or limited data share",
        ),
      );
      await user.selectOptions(screen.getByLabelText("Approval scope"), kind);
      if (kind === "change_provider")
        await user.selectOptions(
          screen.getByLabelText("Requested provider"),
          "P-02",
        );
      await user.type(
        screen.getByLabelText("Reason for this request"),
        "Need a follow-up.",
      );
      await user.click(
        screen.getByRole("button", { name: "Create approval request" }),
      );
      await screen.findByText(
        "Request created. Review its scope in the approvals section before executing.",
      );
      expect(mock.posts[0].body).toEqual({
        kind,
        reason: "Need a follow-up.",
        ...(kind === "change_provider" ? { target_provider_id: "P-02" } : {}),
      });
    },
  );
  it("adds human context through the allowed note event, not forged evidence", async () => {
    const mock = installMockApi();
    renderApp("/customer/cases/RK-2048");
    const user = userEvent.setup();
    const note = await screen.findByLabelText("What should be on the record?");
    await user.type(note, "Please preserve this exact note.");
    await user.click(screen.getByRole("button", { name: "Add to timeline" }));
    expect(await screen.findByText("Household note added")).toBeInTheDocument();
    expect(mock.posts[0].body).toEqual({
      type: "customer_note",
      detail: "Please preserve this exact note.",
    });
    expect(
      screen.getByText("Please preserve this exact note."),
    ).toBeInTheDocument();
    expect(mock.state.item.evidence).toHaveLength(0);
  });
});
describe("separate portal workflows", () => {
  it("creates a customer case from chat only after explicit confirmation", async () => {
    const mock = installPortalMockApi();
    renderApp("/customer/chat");
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("button", { name: "New conversation" }),
    );
    expect(mock.chatPosts[0]).toMatchObject({
      path: "/api/chat/conversations",
      body: { household_id: "HH-01" },
      headers: { "X-Demo-Role": "household" },
    });
    await user.selectOptions(
      await screen.findByLabelText("Choose an appliance for a repair request"),
      "ASSET-01",
    );
    await user.click(screen.getByRole("button", { name: "Choose appliance" }));
    const complaint = "The purifier has very low water flow today.";
    await user.type(
      await screen.findByLabelText(/Describe the problem/),
      complaint,
    );
    await user.click(screen.getByRole("button", { name: "Send message" }));
    expect(
      await screen.findByRole("heading", { name: "Review repair request" }),
    ).toBeInTheDocument();
    expect(mock.chatPosts.at(-1)?.body).toEqual({
      text: complaint,
      action: "message",
    });
    expect(
      screen.queryByRole("link", { name: "Case RK-2048" }),
    ).not.toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Confirm repair request" }),
    );
    expect(
      await screen.findByRole("link", { name: "Case RK-2048" }),
    ).toHaveAttribute("href", "/customer/cases/RK-2048");
    expect(mock.chatPosts.at(-1)?.body).toEqual({
      text: "Confirm repair request",
      action: "confirm_report",
    });
    expect(
      mock.chatPosts.every(
        (post) =>
          (post.headers as Record<string, string>)["X-Demo-Role"] ===
          "household",
      ),
    ).toBe(true);
  });

  it("limits provider cases to the selected provider’s queue", async () => {
    const mock = installPortalMockApi();
    renderApp("/provider");
    const user = userEvent.setup();
    const queue = await screen.findByLabelText("Provider record");
    expect(
      await screen.findByRole("link", { name: "Open provider case" }),
    ).toHaveAttribute("href", "/provider?provider=P-01&case=RK-2048");
    await user.click(screen.getByRole("link", { name: "Open provider case" }));
    expect(
      await screen.findByText("The documentary quote is fixed."),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Approve ₹749" }),
    ).not.toBeInTheDocument();
    await user.selectOptions(queue, "P-02");
    expect(
      await screen.findByText("No cases in this provider’s queue"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Open provider case" }),
    ).not.toBeInTheDocument();
    expect(
      mock.fetchMock.mock.calls.some(
        ([url]) => String(url) === "/api/providers/P-02/queue",
      ),
    ).toBe(true);
  });
});

describe("simulation controls", () => {
  it("runs only one step and requires acknowledgement to reset", async () => {
    const mock = installMockApi();
    renderApp("/project/simulation");
    const user = userEvent.setup();
    const reset = await screen.findByRole("button", {
      name: "Reset demo case",
    });
    expect(reset).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Run one step" }));
    expect(
      await screen.findByText("1 of 6 steps completed"),
    ).toBeInTheDocument();
    expect(
      mock.posts.filter((post) => post.path === "/api/simulation/next"),
    ).toHaveLength(1);
    await user.click(screen.getByRole("checkbox", { name: /I understand/ }));
    await user.click(reset);
    expect(
      await screen.findByText(
        "Demo reset. Unrelated cases and signup records are preserved.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("0 of 6 steps completed")).toBeInTheDocument();
    expect(screen.getByRole("checkbox")).not.toBeChecked();
  });
  it("shows rejected-approval 409 without auto-approving or advancing", async () => {
    const mock = installMockApi();
    mock.state.item.approvals[0].status = "rejected";
    renderApp("/project/simulation");
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("button", { name: "Run one step" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Rejected approvals block simulation progression.",
    );
    expect(mock.state.simulation.step).toBe(0);
    expect(screen.getByRole("button", { name: "Run one step" })).toBeEnabled();
  });
  it("disables advancement after final closure", async () => {
    const mock = installMockApi();
    mock.state.simulation = {
      ...mock.state.simulation,
      step: 6,
      complete: true,
      next_event: null,
    };
    renderApp("/project/simulation");
    expect(
      await screen.findByRole("button", { name: "All steps complete" }),
    ).toBeDisabled();
    expect(screen.getByText("Walkthrough complete.")).toBeInTheDocument();
  });
  it("disables both step and reset during an in-flight step", async () => {
    const mock = installMockApi();
    const original = mock.fetchMock.getMockImplementation()!;
    let finish: (response: Response) => void = () => {};
    mock.fetchMock.mockImplementation((input, init) =>
      String(input).endsWith("/simulation/next")
        ? new Promise<Response>((resolve) => {
            finish = resolve;
          })
        : original(input, init),
    );
    renderApp("/project/simulation");
    const user = userEvent.setup();
    await screen.findByRole("button", { name: "Run one step" });
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Run one step" }));
    expect(screen.getByRole("button", { name: "Advancing…" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Reset demo case" }),
    ).toBeDisabled();
    finish(json(mock.state.simulation));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Run one step" }),
      ).toBeEnabled(),
    );
  });
});
describe("local signup", () => {
  it("requires explicit consent, submits only local fields, and displays server acknowledgement", async () => {
    const mock = installMockApi();
    renderApp("/project/landing");
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Your name"), "Local tester");
    await user.type(
      screen.getByLabelText("Email address"),
      "tester@example.test",
    );
    expect(
      screen.getByRole("button", { name: "Save local signup" }),
    ).toBeDisabled();
    expect(mock.posts).toHaveLength(0);
    await user.click(screen.getByRole("checkbox", { name: /I consent/ }));
    await user.click(screen.getByRole("button", { name: "Save local signup" }));
    expect(
      await screen.findByText("Saved to the local demo only."),
    ).toBeInTheDocument();
    expect(mock.posts[0]).toMatchObject({
      path: "/api/signup",
      body: {
        name: "Local tester",
        email: "tester@example.test",
        consent: true,
      },
    });
    expect(
      screen.getByText(/No email or external signup was sent/),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Record another local signup" }),
    );
    expect(screen.getByLabelText("Your name")).toHaveValue("");
    expect(screen.getByRole("checkbox")).not.toBeChecked();
  });
});
