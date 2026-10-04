import { chromium, expect } from "@playwright/test";
import path from "node:path";

const base = process.env.RK_WEB_URL ?? "http://127.0.0.1:5173";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const visit = (url) => page.goto(base + url);
let caseId;
const getCase = async () =>
  (await page.request.get(`${base}/api/cases/${caseId}`)).json();
const status = (value) =>
  expect.poll(async () => (await getCase()).status).toBe(value);

try {
  await visit("/customer/home");
  await page.getByText("Create a household", { exact: true }).click();
  await page
    .getByLabel("Household name", { exact: true })
    .fill("Browser household");
  await page
    .getByLabel("First household member", { exact: true })
    .fill("Browser resident");
  await page
    .getByRole("button", { name: "Save household", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Browser household", exact: true }),
  ).toBeVisible();
  await page.getByText("Add an appliance", { exact: true }).click();
  await page
    .getByLabel("Appliance household")
    .selectOption({ label: "Browser household" });
  await page
    .getByLabel("Appliance name", { exact: true })
    .fill("Browser refrigerator");
  await page
    .getByLabel("Asset category", { exact: true })
    .selectOption("refrigerator");
  await page.getByLabel("Brand", { exact: true }).fill("User-recorded brand");
  await page.getByLabel("Model", { exact: true }).fill("Household model");
  await page
    .getByLabel("Location in the home", { exact: true })
    .fill("Kitchen");
  await page
    .getByLabel("Installation date", { exact: true })
    .fill("2024-01-01");
  await page
    .getByRole("button", { name: "Save appliance", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: /Browser refrigerator/ }),
  ).toBeVisible();
  await visit("/customer/home?report=1");
  await page
    .getByLabel("Which asset needs attention?")
    .selectOption({ label: "Browser refrigerator · Kitchen" });
  await page
    .getByLabel("Describe the problem in your own words")
    .fill("Cooling is not maintaining the expected temperature.");
  await page
    .getByRole("button", { name: "Create local case", exact: true })
    .click();
  await expect(page).toHaveURL(/\/customer\/cases\/RK-/);
  caseId = new URL(page.url()).pathname.split("/").at(-1);
  expect(caseId).not.toBe("RK-2048");
  await status("awaiting_quote");
  expect((await getCase()).quote_amount).toBeNull();

  const providerResponse = await page.request.post(`${base}/api/providers`, {
    headers: { "X-Demo-Role": "provider" },
    data: { name: "Browser cooling provider", trade: "refrigerator" },
  });
  expect(providerResponse.status(), await providerResponse.text()).toBe(201);
  const providerId = (await providerResponse.json()).id;
  await visit("/provider");
  await page.getByLabel("Provider record").selectOption(providerId);
  const queueItem = page.locator("article").filter({ hasText: caseId });
  await expect(queueItem).toContainText("Quote request");
  await queueItem.getByRole("link", { name: "Open provider case" }).click();
  await expect(page).toHaveURL(
    `${base}/provider?provider=${providerId}&case=${caseId}`,
  );
  await page.getByLabel("Quote amount (whole INR)").fill("1200");
  await page
    .getByLabel("Proposed service", { exact: true })
    .fill("Replace thermostat and verify cooling.");
  await page
    .getByRole("button", { name: "Submit quote for approval", exact: true })
    .click();
  await status("waiting_for_approval");
  await visit(`/customer/cases/${caseId}`);
  await page
    .getByRole("button", { name: "Approve ₹1,200", exact: true })
    .click();
  await status("approved");
  await page
    .getByRole("button", {
      name: "Assign approved provider (mock)",
      exact: true,
    })
    .click();
  await status("assigned");

  await visit(`/provider?provider=${providerId}&case=${caseId}`);
  await expect(
    page.getByRole("heading", { name: "Record service evidence" }),
  ).toBeVisible();
  await page
    .getByLabel("Work performed", { exact: true })
    .fill("Replaced the reported faulty thermostat.");
  await page
    .getByLabel("Observed result", { exact: true })
    .fill("Cooling returned to the documented target range.");
  await page
    .getByRole("button", { name: "Save service report", exact: true })
    .click();
  await status("awaiting_confirmation");
  await page
    .locator("#provider-note")
    .fill("Reviewed the service report and cooling result.");
  await page
    .getByRole("button", { name: "Submit provider confirmation", exact: true })
    .click();
  await expect
    .poll(async () => (await getCase()).provider_confirmed)
    .toBe(true);
  expect((await getCase()).status).not.toBe("closed");
  await visit(`/customer/cases/${caseId}`);
  await page
    .locator("#household-note")
    .fill("Checked the appliance and confirmed the reported result.");
  await page
    .getByRole("button", { name: "Submit household confirmation", exact: true })
    .click();
  await status("closed");
  await page.reload();
  await expect(
    page.locator(".case-summary").getByText("Closed", { exact: true }),
  ).toBeVisible();
  expect((await getCase()).evidence.at(-1).truth_label).toBe(
    "REAL_HUMAN_INPUT",
  );
  const artifacts = process.env.RK_ARTIFACT_DIR ?? path.resolve("../artifacts");
  await page.screenshot({
    path: path.join(artifacts, "working-case-desktop.png"),
    fullPage: true,
  });
  // Coordinates below are browser-test fixtures, never a real user location.
  await visit(`/provider?provider=${providerId}`);
  await page
    .getByText("Shop location for nearby matching", { exact: true })
    .click();
  await page.getByLabel("Shop address (optional)").fill("Test fixture shop");
  await page.getByLabel("Latitude (optional)").fill("12.98");
  await page.getByLabel("Longitude (optional)").fill("77.60");
  await page.getByRole("button", { name: "Save recorded location" }).click();
  await expect
    .poll(async () => {
      const providers = await (
        await page.request.get(`${base}/api/providers`)
      ).json();
      return providers.find((provider) => provider.id === providerId).latitude;
    })
    .toBe(12.98);
  const distant = await page.request.post(`${base}/api/providers`, {
    headers: { "X-Demo-Role": "provider" },
    data: {
      name: "Distant fixture shop",
      trade: "refrigerator",
      latitude: 13.5,
      longitude: 78.0,
    },
  });
  expect(distant.status()).toBe(201);
  const original = await getCase();
  const automated = await page.request.post(`${base}/api/cases`, {
    data: {
      asset_id: original.asset_id,
      complaint: "Another cooling problem for the automated browser fixture.",
    },
  });
  expect(automated.status()).toBe(201);
  caseId = (await automated.json()).id;
  await visit(`/customer/cases/${caseId}`);
  await page
    .getByLabel("Household address (optional)")
    .fill("Test fixture household");
  await page.getByLabel("Latitude (optional)").fill("12.97");
  await page.getByLabel("Longitude (optional)").fill("77.59");
  await page.getByRole("button", { name: "Save recorded location" }).click();
  await status("waiting_for_approval");
  const getCoordination = async () =>
    (await page.request.get(`${base}/api/cases/${caseId}/coordination`)).json();
  expect((await getCoordination()).state.provider_id).toBe(providerId);
  const consent = page.getByRole("button", {
    name: "Approve cost and timing & auto-assign (mock)",
  });
  await expect(consent).toBeDisabled();
  await page
    .getByRole("checkbox", { name: /I explicitly approve the fixture total/ })
    .check();
  await expect(consent).toBeDisabled();
  expect((await getCase()).assigned).toBe(false);
  await page
    .getByRole("checkbox", {
      name: /I explicitly approve the displayed simulated timing/,
    })
    .check();
  await consent.click();
  await status("assigned");
  await page.reload();
  await expect(
    page.getByText(
      "Mock assignment recorded. This does not mean a real visit has occurred.",
    ),
  ).toBeVisible();
  await visit(`/provider?provider=${providerId}&case=${caseId}`);
  await page
    .getByRole("button", { name: "Report simulated completion (mock)" })
    .click();
  await expect
    .poll(async () => (await getCoordination()).state.status)
    .toBe("provider_reported_completion");
  expect((await getCase()).provider_confirmed).toBe(true);
  expect((await getCase()).household_confirmed).toBe(false);
  expect((await getCase()).status).not.toBe("closed");
  const notifications = await (
    await page.request.get(`${base}/api/notifications`)
  ).json();
  expect(
    notifications.some(
      (item) =>
        item.case_id === caseId &&
        item.message.includes("Simulated provider reports completion"),
    ),
  ).toBe(true);
  await visit(`/customer/cases/${caseId}`);
  await expect(
    page.getByText(
      "Mock provider-reported completion — not household confirmation.",
      { exact: true },
    ),
  ).toBeVisible();
  await page.locator("#household-result").selectOption("false");
  await page
    .locator("#household-note")
    .fill("Browser fixture: still unresolved, do not claim verified closure.");
  await page
    .getByRole("button", {
      name: "Submit household unresolved report",
      exact: true,
    })
    .click();
  await status("reopened");
  console.log(
    "PASS: recorded nearest-shop distances, automatic offer and persisted bot conversation, combined cost/timing consent, auto-assignment, mock provider completion and customer notification without forged closure",
  );
  // Both portals can register dates. The isolated server checks reminders every second.
  await visit("/customer/home");
  await page
    .getByLabel("Household for service schedules")
    .selectOption(original.household_id);
  await page.getByText("Create a service schedule", { exact: true }).click();
  await page.getByLabel("Schedule asset").selectOption(original.asset_id);
  await page.getByLabel("Matching service provider").selectOption(providerId);
  const today = new Date().toISOString().slice(0, 10);
  await page.getByLabel("Next service date", { exact: true }).fill(today);
  await page
    .getByLabel("Schedule note (optional)")
    .fill("Follow-up maintenance browser fixture");
  await page
    .getByRole("button", { name: "Save local schedule", exact: true })
    .click();
  const getSchedules = async () =>
    (
      await page.request.get(
        `${base}/api/households/${original.household_id}/service-schedules`,
      )
    ).json();
  await expect.poll(async () => (await getSchedules()).length).toBe(1);
  const savedSchedule = (await getSchedules())[0];
  const getReminders = async (audience) =>
    (
      await page.request.get(
        `${base}/api/${audience === "household" ? "households" : "providers"}/${audience === "household" ? original.household_id : providerId}/service-reminders`,
      )
    ).json();
  await expect
    .poll(
      async () =>
        (await getReminders("household")).filter(
          (item) => item.schedule_id === savedSchedule.id,
        ).length,
      { timeout: 15000 },
    )
    .toBe(1);
  await expect
    .poll(
      async () =>
        (await getReminders("provider")).filter(
          (item) => item.schedule_id === savedSchedule.id,
        ).length,
    )
    .toBe(1);
  await page.reload();
  await page
    .getByLabel("Household for service schedules")
    .selectOption(original.household_id);
  await expect(
    page.getByText(/should contact your household to arrange service/),
  ).toBeVisible();
  await visit(`/provider?provider=${providerId}`);
  await expect(
    page.getByText(/Please contact the customer to arrange service/),
  ).toBeVisible();
  await page
    .getByLabel("Message or contact note")
    .fill("Please let us know a convenient time for the scheduled service.");
  await page
    .getByRole("button", { name: "Save local contact record", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await getReminders("provider")).find(
          (item) => item.schedule_id === savedSchedule.id,
        )?.status,
    )
    .toBe("acknowledged");
  await visit("/customer/home");
  await page
    .getByLabel("Household for service schedules")
    .selectOption(original.household_id);
  await expect(
    page.getByText(
      "Please let us know a convenient time for the scheduled service.",
      { exact: true },
    ),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Acknowledge reminder", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await getReminders("household")).find(
          (item) => item.schedule_id === savedSchedule.id,
        )?.status,
    )
    .toBe("acknowledged");
  await visit(`/provider?provider=${providerId}`);
  await page.getByText("Reschedule or update note", { exact: true }).click();
  const later = new Date();
  later.setUTCDate(later.getUTCDate() + 30);
  await page
    .getByLabel("Revised service date")
    .fill(later.toISOString().slice(0, 10));
  await page
    .getByRole("button", { name: "Save schedule changes", exact: true })
    .click();
  await expect.poll(async () => (await getSchedules())[0].revision).toBe(2);
  await expect
    .poll(async () => (await getReminders("household")).length)
    .toBe(0);
  await expect
    .poll(async () => (await getReminders("provider")).length)
    .toBe(0);
  console.log(
    "PASS: customer-registered provider-linked service date, automatic dual-audience due reminders, provider follow-up message visible to customer, acknowledgment and company rescheduling without duplicate reminders or fake external delivery",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await visit("/customer/home");
  await page.getByText("Add an appliance", { exact: true }).click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
  console.log(
    "PASS: browser household + asset creation, provider-attributed API creation, provider queue quote, approval, assignment, real-input service report, two-sided closure, persisted reload and mobile form layout; no simulation used",
  );
} finally {
  await browser.close();
}
