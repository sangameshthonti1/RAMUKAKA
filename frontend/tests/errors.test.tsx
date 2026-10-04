import { expect, it } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { installMockApi, json } from "./fixtures";
import { renderApp } from "./render";
it("renders a fetch error, allows retry, and never falls back to a fictional prompt", async () => {
  const mock = installMockApi();
  mock.fetchMock.mockResolvedValueOnce(
    json({ detail: "Local backend unavailable" }, 503),
  );
  renderApp("/project/system-prompt");
  const user = userEvent.setup();
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Local backend unavailable",
  );
  expect(
    screen.queryByLabelText("Backend system prompt"),
  ).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Try again" }));
  expect(
    await screen.findByLabelText("Backend system prompt"),
  ).toHaveTextContent("Backend-owned instructions");
});
it("shows an unknown-case error without displaying the seed case instead", async () => {
  installMockApi();
  renderApp("/customer/cases/NOT-FOUND");
  expect(await screen.findByRole("alert")).toHaveTextContent("404");
  expect(
    screen.queryByRole("button", { name: "Approve ₹749" }),
  ).not.toBeInTheDocument();
});
