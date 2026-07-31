import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  const response = await page.request.post("/api/auth/login", {
    data: {
      email: "admin@meetbroker.local",
      password: "Admin123!",
    },
  });
  expect(response.ok()).toBe(true);
});

test("shifts the Kyiv schedule into the browser timezone", async ({ page }) => {
  await page.goto("/calendar", { waitUntil: "domcontentloaded" });
  await expect(page.locator(".calendar-card")).toBeVisible();

  expect(
    await page.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone),
  ).toBe("Europe/Berlin");
  await expect(page.locator(".timezone-note")).toContainText("Europe/Berlin");
  await expect(page.locator(".timezone-note")).toContainText("Europe/Kyiv");

  const labels = await page
    .locator(".time-column span")
    .evaluateAll((elements) =>
      elements.slice(0, 7).map((element) => element.textContent?.trim()),
    );
  expect(labels).toEqual([
    "06:00",
    "06:30",
    "07:00",
    "07:30",
    "08:00",
    "08:30",
    "09:00",
  ]);
});
