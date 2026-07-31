import { describe, expect, it } from "vitest";
import { validateEnvironment } from "./environment";

const validEnvironment = {
  NODE_ENV: "development",
  APP_MODE: "DEMO",
  APP_ORIGIN: "http://localhost:8080",
  DATABASE_URL: "postgres://meetbroker:meetbroker@localhost:5432/meetbroker",
  EMAIL_VERIFICATION_REQUIRED: "false",
  TELEGRAM_UPDATE_MODE: "DISABLED",
};

describe("validateEnvironment", () => {
  it("normalizes defaults without exposing optional integrations", () => {
    const result = validateEnvironment(validEnvironment);

    expect(result.API_PORT).toBe("3000");
    expect(result.SESSION_TTL_DAYS).toBe("30");
    expect(result.TELEGRAM_UPDATE_MODE).toBe("DISABLED");
  });

  it("rejects malformed operational values", () => {
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        API_PORT: "70000",
      }),
    ).toThrow("API_PORT");
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        OFFICE_TIMEZONE: "Europe/Not-A-City",
      }),
    ).toThrow("OFFICE_TIMEZONE");
  });

  it("requires configured Telegram credentials outside disabled mode", () => {
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        TELEGRAM_UPDATE_MODE: "POLLING",
      }),
    ).toThrow("TELEGRAM_BOT_TOKEN");
  });

  it("requires a strong webhook header secret", () => {
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        TELEGRAM_UPDATE_MODE: "WEBHOOK",
        TELEGRAM_BOT_TOKEN: "bot-token",
        TELEGRAM_BOT_USERNAME: "meetbroker_bot",
        TELEGRAM_WEBHOOK_SECRET: "change-me",
      }),
    ).toThrow("TELEGRAM_WEBHOOK_SECRET");

    expect(
      validateEnvironment({
        ...validEnvironment,
        TELEGRAM_UPDATE_MODE: "WEBHOOK",
        TELEGRAM_BOT_TOKEN: "bot-token",
        TELEGRAM_BOT_USERNAME: "meetbroker_bot",
        TELEGRAM_WEBHOOK_SECRET: "telegram_webhook_secret_with_32_chars",
      }).TELEGRAM_UPDATE_MODE,
    ).toBe("WEBHOOK");
  });

  it("fails fast when production verification cannot deliver mail", () => {
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        NODE_ENV: "production",
        APP_MODE: "PRODUCTION",
        EMAIL_VERIFICATION_REQUIRED: "true",
      }),
    ).toThrow("SMTP_HOST");
  });
});
