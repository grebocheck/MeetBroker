import { expect, test } from "@playwright/test";

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

test("a booking can be completed from the narrow mobile layout", async ({
  page,
}) => {
  await page.goto("/calendar", { waitUntil: "domcontentloaded" });
  await page.locator(".calendar-table-toolbar .button--primary").click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  const dialogBounds = await dialog.boundingBox();
  expect(dialogBounds).not.toBeNull();
  expect(dialogBounds!.x).toBeGreaterThanOrEqual(-1);
  expect(dialogBounds!.x + dialogBounds!.width).toBeLessThanOrEqual(391);

  const start = nextMondayAtTen();
  const end = new Date(start.getTime() + 30 * 60_000);
  const title = `Mobile flow ${Date.now()}`;

  await dialog.getByLabel("Назва зустрічі").fill(title);
  await dialog.getByLabel("Початок").fill(toDateTimeLocal(start));
  await dialog.getByLabel("Завершення").fill(toDateTimeLocal(end));

  const createResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/bookings") &&
      response.request().method() === "POST",
  );
  await dialog
    .getByRole("button", { name: "Забронювати", exact: true })
    .click();
  const response = await createResponse;
  expect(response.status()).toBe(201);
  const booking = (await response.json()) as { id: string };

  await expect(dialog).toBeHidden();
  const overflow = await page.evaluate(
    () =>
      Math.max(
        document.body.scrollWidth,
        document.documentElement.scrollWidth,
      ) - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);

  const cleanup = await page.request.delete(`/api/bookings/${booking.id}`, {
    data: { reason: "Mobile booking acceptance cleanup" },
  });
  expect(cleanup.ok()).toBe(true);
});

function nextMondayAtTen(): Date {
  const result = new Date();
  result.setDate(result.getDate() + 14);
  result.setHours(10, 0, 0, 0);
  while (result.getDay() !== 1) {
    result.setDate(result.getDate() + 1);
  }
  return result;
}

function toDateTimeLocal(value: Date): string {
  const pad = (part: number) => String(part).padStart(2, "0");
  return [
    value.getFullYear(),
    "-",
    pad(value.getMonth() + 1),
    "-",
    pad(value.getDate()),
    "T",
    pad(value.getHours()),
    ":",
    pad(value.getMinutes()),
  ].join("");
}
