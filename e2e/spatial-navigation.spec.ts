import { expect, test, type Locator, type Page } from "@playwright/test";
import { demoCredentials } from "./demo-credentials";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("meetbroker.locale", "uk");
  });
  const response = await page.request.post("/api/auth/login", {
    data: {
      email: demoCredentials.admin.email,
      password: demoCredentials.admin.password,
    },
  });
  expect(response.ok()).toBe(true);
});

test("arrow keys traverse the sidebar and its quick settings", async ({
  page,
}) => {
  await page.goto("/my-calendar", { waitUntil: "networkidle" });

  const navigationItems = page.locator(".main-nav .nav-item");
  const first = navigationItems.first();
  const second = navigationItems.nth(1);
  const last = navigationItems.last();
  const theme = page.locator(".sidebar-utilities > .utility-control");
  const language = page.locator(".language-control > summary");

  await first.focus();
  await page.keyboard.press("ArrowDown");
  await expect(second).toBeFocused();

  await last.focus();
  await page.keyboard.press("ArrowDown");
  await expect(theme).toBeFocused();

  await page.keyboard.press("ArrowRight");
  await expect(language).toBeFocused();

  await page.keyboard.press("ArrowDown");
  const firstLanguage = page
    .locator(".language-menu [role='menuitem']")
    .first();
  await expect(firstLanguage).toBeFocused();
  await expect(page.locator(".language-control")).toHaveAttribute("open", "");

  await page.keyboard.press("ArrowLeft");
  await expect(language).toBeFocused();
  await expect(page.locator(".language-control")).not.toHaveAttribute("open");

  await page.keyboard.press("ArrowLeft");
  await expect(theme).toBeFocused();
  await page.keyboard.press("ArrowUp");
  await expect(last).toBeFocused();
});

test("spatial movement stays inside an open modal", async ({ page }) => {
  await page.goto("/calendar", { waitUntil: "networkidle" });
  await page.locator(".calendar-table-toolbar .button--primary").click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expectFocusWithin(page, dialog);

  for (const key of [
    "ArrowDown",
    "ArrowRight",
    "ArrowDown",
    "ArrowLeft",
    "ArrowUp",
  ]) {
    await page.keyboard.press(key);
    await expectFocusWithin(page, dialog);
  }
});

async function expectFocusWithin(page: Page, container: Locator) {
  const containsFocus = await container.evaluate(
    (element) =>
      document.activeElement instanceof HTMLElement &&
      element.contains(document.activeElement),
  );
  expect(containsFocus).toBe(true);
  await expect(page.locator(".sidebar :focus")).toHaveCount(0);
}
