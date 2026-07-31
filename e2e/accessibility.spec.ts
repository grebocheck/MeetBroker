import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const routes = [
  "/my-calendar",
  "/calendar",
  "/bookings",
  "/events",
  "/notifications",
  "/profile",
  "/admin",
] as const;

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("meetbroker.locale", "uk");
    window.localStorage.setItem("meetbroker.calendarLayout", "FIT");
  });
  const response = await page.request.post("/api/auth/login", {
    data: {
      email: "admin@meetbroker.local",
      password: "Admin123!",
    },
  });
  expect(response.ok()).toBe(true);
});

test("primary authenticated pages have no serious automated accessibility violations", async ({
  page,
}) => {
  for (const route of routes) {
    await test.step(route, async () => {
      await page.goto(route, { waitUntil: "networkidle" });
      await expect(page.locator("#main-content")).toBeVisible();

      const result = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();
      const blocking = result.violations.filter(
        ({ impact }) => impact === "serious" || impact === "critical",
      );

      expect(
        blocking,
        `${route} contains serious or critical axe violations`,
      ).toEqual([]);
    });
  }
});

test("booking dialog preserves accessible structure", async ({ page }) => {
  await page.goto("/calendar", { waitUntil: "networkidle" });
  await page.locator(".calendar-table-toolbar .button--primary").click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute("aria-modal", "true");
  await expect(dialog).toHaveAttribute("aria-labelledby");

  const result = await new AxeBuilder({ page })
    .include(".modal-backdrop")
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const blocking = result.violations.filter(
    ({ impact }) => impact === "serious" || impact === "critical",
  );
  expect(blocking).toEqual([]);
});

test("keyboard users can enter the main content through the skip link", async ({
  page,
}) => {
  await page.goto("/my-calendar", { waitUntil: "networkidle" });
  await page.keyboard.press("Tab");

  const skipLink = page.locator(".skip-link");
  await expect(skipLink).toBeFocused();
  await skipLink.press("Enter");
  await expect(page.locator("#main-content")).toBeFocused();
});
