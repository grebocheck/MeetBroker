import { expect, test } from "@playwright/test";

const routes = [
  { path: "/my-calendar", title: "Мої зустрічі" },
  { path: "/calendar", title: "Розклад" },
  { path: "/bookings", title: "Мої бронювання" },
  { path: "/events", title: "Відкриті події" },
  { path: "/notifications", title: "Сповіщення" },
  { path: "/profile", title: "Профіль" },
  { path: "/admin", title: "Адміністрування" },
] as const;

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.removeItem("meetbroker.calendarLayout");
  });
  const response = await page.request.post("/api/auth/login", {
    data: {
      email: "admin@meetbroker.local",
      password: "Admin123!",
    },
  });
  expect(response.ok()).toBe(true);
});

test("critical pages stay usable without horizontal viewport overflow", async ({
  page,
}) => {
  const runtimeErrors: string[] = [];
  page.on("pageerror", (error) => runtimeErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") runtimeErrors.push(message.text());
  });

  for (const { path, title } of routes) {
    await test.step(path, async () => {
      await page.goto(path, { waitUntil: "domcontentloaded" });
      await expect(page.locator("#main-content")).toBeVisible();
      await expect(page.locator(".splash")).toHaveCount(0);
      await expect(page).toHaveTitle(`${title} — MeetBroker`);

      const overflow = await page.evaluate(
        () =>
          Math.max(
            document.documentElement.scrollWidth,
            document.body.scrollWidth,
          ) - document.documentElement.clientWidth,
      );
      expect(
        overflow,
        `${path} has horizontal viewport overflow`,
      ).toBeLessThanOrEqual(1);

      const clippedControls = await page
        .locator(
          "#main-content :is(button,a,input,select,textarea,summary):visible",
        )
        .evaluateAll((elements) =>
          elements
            .map((element) => {
              const rectangle = element.getBoundingClientRect();
              return {
                label:
                  element.getAttribute("aria-label") ??
                  element.textContent?.trim().slice(0, 80) ??
                  element.tagName,
                left: rectangle.left,
                right: rectangle.right,
              };
            })
            .filter(
              ({ left, right }) =>
                left < -1 || right > document.documentElement.clientWidth + 1,
            ),
        );
      expect(clippedControls, `${path} has clipped controls`).toEqual([]);
    });
  }

  expect(runtimeErrors).toEqual([]);
});

test("calendar defaults to seven days and offers fitted mode", async ({
  page,
}) => {
  await page.goto("/calendar", { waitUntil: "domcontentloaded" });
  await expect(page.locator(".day-heading")).toHaveCount(7);

  const modeButtons = page.locator(".calendar-layout-toggle button");
  await expect(modeButtons).toHaveCount(2);
  await expect(modeButtons.first()).toHaveAttribute("aria-pressed", "true");
  await expect(modeButtons.first()).toContainText("7");
  await expect(modeButtons.nth(1)).toContainText("Авто");

  const pageMark = await page
    .locator(".calendar-toolbar__word")
    .evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      return {
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
        left: bounds.left,
        right: bounds.right,
        viewportWidth: document.documentElement.clientWidth,
      };
    });
  expect(pageMark.scrollWidth).toBeLessThanOrEqual(pageMark.clientWidth + 1);
  expect(pageMark.left).toBeGreaterThanOrEqual(-1);
  expect(pageMark.right).toBeLessThanOrEqual(pageMark.viewportWidth + 1);

  await modeButtons.nth(1).click();
  await expect(modeButtons.nth(1)).toHaveAttribute("aria-pressed", "true");
  const fittedCount = await page.locator(".day-heading").count();
  expect(fittedCount).toBeGreaterThanOrEqual(2);
  expect(fittedCount).toBeLessThanOrEqual(7);

  const calendarOverflow = await page
    .locator(".calendar-scroll")
    .evaluate((element) => element.scrollWidth - element.clientWidth);
  expect(calendarOverflow).toBeLessThanOrEqual(1);
});
