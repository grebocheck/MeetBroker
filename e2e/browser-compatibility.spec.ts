import { expect, test } from "@playwright/test";
import { demoCredentials } from "./demo-credentials";

test("renders the core booking journey without browser runtime errors", async ({
  page,
  browserName,
}) => {
  const runtimeErrors: string[] = [];
  page.on("pageerror", (error) => runtimeErrors.push(error.message));

  await page.addInitScript(() => {
    window.localStorage.setItem("meetbroker.locale", "uk");
    window.localStorage.setItem("meetbroker.calendarLayout", "FIT");
  });
  const login = await page.request.post("/api/auth/login", {
    data: {
      email: demoCredentials.admin.email,
      password: demoCredentials.admin.password,
    },
  });
  expect(login.ok()).toBe(true);

  await page.goto("/my-calendar", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#main-content")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    /мої зустрічі/i,
  );

  await page.goto("/calendar", { waitUntil: "domcontentloaded" });
  await expect(page.locator(".calendar-scroll")).toBeVisible();
  await page.locator(".calendar-table-toolbar .button--primary").click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);

  expect(runtimeErrors, `${browserName} emitted uncaught page errors`).toEqual(
    [],
  );
});
