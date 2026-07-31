import { mkdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { chromium } from "@playwright/test";
import sharp from "sharp";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:8080";
const outputDir = path.resolve("docs/screenshots");

const shots = [
  {
    name: "my-meetings-light",
    route: "/my-calendar",
    viewport: { width: 1440, height: 1000 },
    theme: "light",
  },
  {
    name: "schedule-light",
    route: "/calendar",
    viewport: { width: 1440, height: 1000 },
    theme: "light",
  },
  {
    name: "open-events-dark",
    route: "/events",
    viewport: { width: 1440, height: 1000 },
    theme: "dark",
  },
  {
    name: "admin-rooms-light",
    route: "/admin",
    viewport: { width: 1440, height: 1000 },
    theme: "light",
    prepare: async (page) => {
      await page.locator(".admin-section-tabs button").nth(2).click();
      await page.waitForTimeout(250);
    },
  },
  {
    name: "schedule-mobile-dark",
    route: "/calendar",
    viewport: { width: 390, height: 844 },
    theme: "dark",
    prepare: async (page) => {
      await page.locator(".calendar-layout-toggle button").nth(1).click();
      await page.waitForTimeout(250);
    },
  },
];

await mkdir(outputDir, { recursive: true });
await sharp(path.resolve("apps/web/public/favicon.svg"))
  .resize(256, 256)
  .png()
  .toFile(path.join(outputDir, "brand-mark.png"));

const browser = await chromium.launch();
try {
  for (const shot of shots) {
    const context = await browser.newContext({
      viewport: shot.viewport,
      deviceScaleFactor: 1,
      reducedMotion: "reduce",
    });
    const login = await context.request.post(`${baseURL}/api/auth/login`, {
      data: {
        email: "admin@meetbroker.local",
        password: "Admin123!",
      },
    });
    if (!login.ok()) {
      throw new Error(`Demo login failed with ${login.status()}`);
    }

    const page = await context.newPage();
    await page.goto(`${baseURL}${shot.route}`, { waitUntil: "networkidle" });
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all(
        Array.from(document.images)
          .filter((image) => !image.complete)
          .map(
            (image) =>
              new Promise((resolve) => {
                image.addEventListener("load", resolve, { once: true });
                image.addEventListener("error", resolve, { once: true });
              }),
          ),
      );
    });
    await page.evaluate((theme) => {
      document.documentElement.dataset.theme = theme;
    }, shot.theme);
    await page.addStyleTag({
      content: `
        *, *::before, *::after {
          animation-duration: 0s !important;
          animation-delay: 0s !important;
          transition-duration: 0s !important;
          caret-color: transparent !important;
        }
      `,
    });
    await shot.prepare?.(page);
    await page.evaluate((theme) => {
      document.documentElement.dataset.theme = theme;
      window.scrollTo(0, 0);
    }, shot.theme);
    await page.waitForTimeout(300);

    const png = await page.screenshot({
      fullPage: false,
      animations: "disabled",
    });
    await sharp(png)
      .webp({ quality: 84, effort: 5 })
      .toFile(path.join(outputDir, `${shot.name}.webp`));
    await context.close();
  }
} finally {
  await browser.close();
}

console.log(
  `Captured ${shots.length} screenshots and the document mark in ${outputDir}`,
);
