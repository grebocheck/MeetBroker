import { expect, test } from "@playwright/test";
import { demoCredentials } from "./demo-credentials";

test.beforeEach(async ({ page }) => {
  const response = await page.request.post("/api/auth/login", {
    data: {
      email: demoCredentials.admin.email,
      password: demoCredentials.admin.password,
    },
  });
  expect(response.ok()).toBe(true);
});

test("keeps the current page visible while the next route chunk loads", async ({
  page,
}) => {
  let releaseChunk: (() => void) | undefined;
  const chunkRequested = new Promise<void>((resolve) => {
    void page.route(/\/assets\/BookingListPage-[^/]+\.js$/, async (route) => {
      resolve();
      await new Promise<void>((release) => {
        releaseChunk = release;
      });
      await route.continue();
    });
  });

  await page.goto("/my-calendar");
  const currentHeading = page.getByRole("heading", {
    level: 1,
    name: "Мої зустрічі",
  });
  await expect(currentHeading).toBeVisible();

  await page
    .getByRole("link", { name: "Мої бронювання", includeHidden: true })
    .evaluate((link) => (link as HTMLAnchorElement).click());
  await chunkRequested;
  await expect(page).toHaveURL(/\/bookings$/);
  await expect(currentHeading).toBeVisible();
  await expect(page.getByText("Готуємо ваш робочий простір…")).toHaveCount(0);

  releaseChunk?.();
  await expect(
    page.getByRole("heading", { level: 1, name: "Мої бронювання" }),
  ).toBeVisible();
});
