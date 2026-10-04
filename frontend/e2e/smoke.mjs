import { chromium, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const base = process.env.RK_WEB_URL ?? "http://127.0.0.1:5173";
const artifacts = process.env.RK_ARTIFACT_DIR ?? path.resolve("../artifacts");
await mkdir(artifacts, { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
page.route("**/*", (route) =>
  new URL(route.request().url()).origin === new URL(base).origin
    ? route.continue()
    : route.abort(),
);
const get = async (endpoint) => {
  const response = await page.request.get(`${base}/api${endpoint}`, {
    headers: { "X-Demo-Role": "household" },
  });
  expect(response.ok(), await response.text()).toBe(true);
  return response.json();
};
const post = async (endpoint, data = {}) => {
  const response = await page.request.post(`${base}/api${endpoint}`, { data });
  expect(response.ok(), await response.text()).toBe(true);
  return response.json();
};
const visit = async (route, heading) => {
  await page.goto(base + route);
  await expect(
    page.getByRole("heading", { name: heading, exact: true, level: 1 }),
  ).toBeVisible();
  if (route !== "/") {
    await expect(
      page.locator(".demo-chip", { hasText: "MOCK / DEMO" }),
    ).toBeVisible();
    await expect(page.locator("main")).not.toContainText("Could not load");
  }
};
const status = (id, value) =>
  expect.poll(async () => (await get(`/cases/${id}`)).status).toBe(value);

try {
  await visit("/", "Your home, looked after.");
  await expect(
    page.getByRole("link", { name: "Open customer portal" }),
  ).toHaveAttribute("href", "/customer");
  await expect(
    page.getByRole("link", { name: "Open provider portal" }),
  ).toHaveAttribute("href", "/provider");
  await page.getByRole("link", { name: "Open customer portal" }).click();
  await expect(page).toHaveURL(`${base}/customer`);
  await expect(
    page.getByRole("heading", { name: "A home that’s looked after." }),
  ).toBeVisible();
  await page
    .getByRole("navigation", { name: "customer navigation" })
    .getByRole("link", { name: "My Home" })
    .click();
  await expect(page).toHaveURL(`${base}/customer/home`);
  await expect(
    page.getByRole("heading", { name: "My Home", level: 1 }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Kent water purifier/ }),
  ).toBeVisible();
  await page
    .getByRole("navigation", { name: "customer navigation" })
    .getByRole("link", { name: "Service chat" })
    .click();
  await expect(page).toHaveURL(`${base}/customer/chat`);
  await expect(
    page.getByRole("heading", { name: "Service chat", level: 1 }),
  ).toBeVisible();

  await page.getByRole("button", { name: "New conversation" }).click();
  await expect(
    page.getByRole("button", { name: /Conversation .*Open/ }).first(),
  ).toBeVisible();
  const conversationId = (
    await get("/chat/conversations?household_id=household-sangamesh")
  )[0].id;
  const complaint = "Water flow from the purifier is much lower than normal.";
  await page
    .getByLabel("Send a message")
    .fill("Please repair the water purifier");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(
    page.getByLabel("Choose an appliance for a repair request"),
  ).toBeVisible();
  await page.locator("#chat-asset").selectOption("asset-kent-purifier");
  await page.getByRole("button", { name: "Choose appliance" }).click();
  await expect(
    page.getByLabel("Describe the problem (at least 10 characters)"),
  ).toBeVisible();
  await page
    .getByLabel("Describe the problem (at least 10 characters)")
    .fill(complaint);
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(
    page.getByRole("heading", { name: "Review repair request" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Review repair request" }),
  ).toBeVisible();
  expect(
    (await get(`/chat/conversations/${conversationId}`)).draft_complaint,
  ).toBe(complaint);
  await page.getByRole("button", { name: "Confirm repair request" }).click();
  const caseLink = page.getByRole("link", { name: /^Case RK-/ });
  await expect(caseLink).toBeVisible();
  const caseId = (await caseLink.getAttribute("href")).split("/").at(-1);
  expect(caseId).not.toBe("RK-2048");
  await status(caseId, "awaiting_quote");
  expect((await get(`/cases/${caseId}`)).quote_amount).toBeNull();
  expect((await get(`/chat/conversations/${conversationId}`)).case_id).toBe(
    caseId,
  );
  await caseLink.click();
  await expect(page).toHaveURL(`${base}/customer/cases/${caseId}`);
  await expect(
    page.getByText(complaint, { exact: true }).first(),
  ).toBeVisible();
  await page.getByRole("link", { name: "All cases" }).click();
  await expect(page).toHaveURL(`${base}/customer/cases`);
  await expect(
    page.getByRole("link", { name: new RegExp(caseId) }),
  ).toBeVisible();
  console.log(
    "PASS: portal choice, customer dashboard/home/cases, persisted chat draft and explicit case creation",
  );

  await visit("/", "Your home, looked after.");
  await page.getByRole("link", { name: "Open provider portal" }).click();
  await expect(page).toHaveURL(`${base}/provider`);
  await expect(
    page.getByRole("heading", { name: "Provider Desk", level: 1 }),
  ).toBeVisible();
  await page.getByLabel("Provider record").selectOption("provider-aqua-care");
  const queueItem = page.locator("article").filter({ hasText: caseId });
  await expect(queueItem).toContainText("Quote request");
  await queueItem.getByRole("link", { name: "Open provider case" }).click();
  await expect(page).toHaveURL(
    new RegExp(`/provider\\?provider=provider-aqua-care&case=${caseId}$`),
  );
  await page.getByLabel("Quote amount (whole INR)").fill("1200");
  await page
    .getByLabel("Proposed service")
    .fill("Replace the purifier filter and check water flow.");
  await page.getByRole("button", { name: "Submit quote for approval" }).click();
  await status(caseId, "waiting_for_approval");
  expect((await get(`/cases/${caseId}`)).quote_amount).toBe(1200);
  await visit(`/customer/cases/${caseId}`, "Your case");
  await page.getByRole("button", { name: "Approve ₹1,200" }).click();
  await status(caseId, "approved");
  expect((await get(`/cases/${caseId}`)).assigned).toBe(false);
  await page
    .getByRole("button", { name: "Assign approved provider (mock)" })
    .click();
  await status(caseId, "assigned");
  expect((await get(`/cases/${caseId}`)).assigned).toBe(true);

  await visit(
    `/provider?provider=provider-aqua-care&case=${caseId}`,
    "Provider Desk",
  );
  await expect(
    page.getByRole("heading", { name: "Case conversation" }),
  ).toBeVisible();
  const providerMessage = "I will check the filter and measure the water flow.";
  await page.getByLabel("Message the household").fill(providerMessage);
  await page.getByRole("button", { name: "Send update" }).click();
  await expect
    .poll(async () =>
      (await get(`/chat/conversations/${conversationId}`)).messages.some(
        (message) =>
          message.role === "provider" && message.content === providerMessage,
      ),
    )
    .toBe(true);
  await page
    .getByLabel("Work performed")
    .fill("Replaced the filter and flushed the purifier lines.");
  await page
    .getByLabel("Observed result")
    .fill("Water flow returned to its normal level on inspection.");
  await page.getByRole("button", { name: "Save service report" }).click();
  await status(caseId, "awaiting_confirmation");
  expect(
    (await get(`/cases/${caseId}`)).evidence.some(
      (item) => item.kind === "service",
    ),
  ).toBe(true);
  await page
    .locator("#provider-note")
    .fill("Checked the filter and confirmed normal water flow.");
  await page
    .getByRole("button", { name: "Submit provider confirmation" })
    .click();
  await expect
    .poll(async () => (await get(`/cases/${caseId}`)).provider_confirmed)
    .toBe(true);
  expect((await get(`/cases/${caseId}`)).status).not.toBe("closed");
  await visit("/customer/chat", "Service chat");
  await expect(
    page.getByLabel("Messages").getByText(providerMessage, { exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: `Case ${caseId}` }).click();
  await expect(page).toHaveURL(`${base}/customer/cases/${caseId}`);
  await expect(
    page.getByRole("heading", { name: "Household verification" }).first(),
  ).toBeVisible();
  await page
    .locator("#household-note")
    .fill("Checked the purifier and verified the restored flow.");
  await page
    .getByRole("button", { name: "Submit household confirmation" })
    .click();
  await status(caseId, "closed");
  await page.reload();
  await expect(page.locator(".case-summary")).toContainText("Closed");
  const closed = await get(`/cases/${caseId}`);
  expect(closed.provider_confirmed).toBe(true);
  expect(closed.household_confirmed).toBe(true);
  console.log(
    "PASS: provider queue, quote, household approval, mock assignment, persistent provider message, report and two-party closure",
  );

  for (const [route, heading] of [
    ["/project/cases", "Case Room"],
    ["/project/cases/RK-2048", "Case Room"],
    ["/project/my-home", "My Home"],
    ["/project/simulation", "The simulation lab"],
    ["/project/evidence", "Evidence Ledger"],
    ["/project/rails", "Rails & APIs"],
    ["/project/system-prompt", "System Prompt"],
    ["/project/business-plan", "The business behind the care."],
    ["/project/risks", "Risks & Safeguards"],
    [
      "/project/landing",
      "Your home has a lot of moving parts. You don’t have to.",
    ],
  ])
    await visit(route, heading);
  await post("/simulation/reset");
  await visit("/project/cases/RK-2048", "Case Room");
  await page.getByRole("button", { name: "Try mock payment" }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await status("RK-2048", "waiting_for_approval");
  await page.getByRole("button", { name: /Reject ₹749/ }).click();
  await status("RK-2048", "approval_rejected");
  await visit("/project/simulation", "The simulation lab");
  await page.getByRole("button", { name: "Run one step" }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await page.getByRole("checkbox", { name: /I understand/ }).check();
  await page.getByRole("button", { name: "Reset demo case" }).click();
  await status("RK-2048", "waiting_for_approval");
  for (let step = 1; step <= 6; step++) {
    await page.getByRole("button", { name: "Run one step" }).click();
    await expect(
      page.getByText(`${step} of 6 steps completed`, { exact: true }),
    ).toBeVisible();
  }
  await status("RK-2048", "closed");
  expect((await get(`/cases/${caseId}`)).status).toBe("closed");
  await visit(
    "/project/landing",
    "Your home has a lot of moving parts. You don’t have to.",
  );
  await page.getByLabel("Your name", { exact: true }).fill("Browser demo");
  await page
    .getByLabel("Email address", { exact: true })
    .fill("browser@example.test");
  await page.getByRole("checkbox", { name: /I consent/ }).check();
  await page.getByRole("button", { name: "Save local signup" }).click();
  await expect(
    page.getByRole("heading", { name: "Interest recorded locally." }),
  ).toBeVisible();
  console.log(
    "PASS: /project documentary pages, guarded payment, rejection/reset, six-step demo and local signup; real case unaffected",
  );

  await post("/simulation/reset");
  await visit("/", "Your home, looked after.");
  await page.screenshot({
    path: path.join(artifacts, "home-desktop.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  for (const [route, heading] of [
    ["/", "Your home, looked after."],
    ["/customer", "A home that’s looked after."],
    ["/customer/home", "My Home"],
    ["/customer/chat", "Service chat"],
    ["/customer/cases", "Your cases"],
    [`/customer/cases/${caseId}`, "Your case"],
    ["/provider", "Provider Desk"],
    ["/project/simulation", "The simulation lab"],
    ["/project/evidence", "Evidence Ledger"],
    ["/project/rails", "Rails & APIs"],
    [
      "/project/landing",
      "Your home has a lot of moving parts. You don’t have to.",
    ],
  ]) {
    await visit(route, heading);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1,
      ),
      `Horizontal overflow: ${route}`,
    ).toBe(true);
  }
  await visit("/customer", "A home that’s looked after.");
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page
    .getByRole("navigation", { name: "customer navigation" })
    .getByRole("link", { name: "My Home" })
    .click();
  await expect(page).toHaveURL(`${base}/customer/home`);
  await expect(
    page.getByRole("button", { name: "Open navigation" }),
  ).toHaveAttribute("aria-expanded", "false");
  await page.screenshot({
    path: path.join(artifacts, "my-home-mobile.png"),
    fullPage: true,
  });
  expect(errors).toEqual([]);
  console.log(
    "PASS: mobile portals/project layouts, navigation, screenshots and no browser runtime errors",
  );
} finally {
  await context.close();
  await browser.close();
}
