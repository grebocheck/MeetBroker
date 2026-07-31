import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("meetbroker.locale", "uk");
  });
});

test("login errors identify the relevant field and clear after editing", async ({
  page,
}) => {
  await page.goto("/login");
  const password = page.getByLabel("Пароль");
  await password.fill("Wrong123!");
  await page.getByRole("button", { name: "Увійти", exact: true }).click();

  await expect(password).toHaveAttribute("aria-invalid", "true");
  await expect(page.locator("#login-password-error")).toContainText(
    "Неправильна email-адреса або пароль",
  );

  await password.fill("Another123!");
  await expect(password).not.toHaveAttribute("aria-invalid");
  await expect(page.locator("#login-password-error")).toHaveCount(0);
});

test("registration conflicts are shown beside the email field", async ({
  page,
}) => {
  await page.goto("/register");
  await page.getByLabel("Ім’я").fill("Existing account");
  await page.getByLabel("Email").fill("admin@meetbroker.local");
  await page.getByLabel("Пароль").fill("Strong123!");
  await page.getByRole("button", { name: "Зареєструватися" }).click();

  const email = page.getByLabel("Email");
  await expect(email).toHaveAttribute("aria-invalid", "true");
  await expect(page.locator("#register-email-error")).toContainText(
    "Ця email-адреса вже використовується",
  );
});
