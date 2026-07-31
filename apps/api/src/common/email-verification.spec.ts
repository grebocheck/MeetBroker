import { ConfigService } from "@nestjs/config";
import { describe, expect, it } from "vitest";
import { EmailVerificationPolicy } from "./email-verification";

function policy(values: Record<string, string> = {}) {
  return new EmailVerificationPolicy(new ConfigService(values));
}

describe("EmailVerificationPolicy", () => {
  it("requires verification by default", () => {
    expect(policy().required).toBe(true);
  });

  it("allows an installation to disable verification explicitly", () => {
    expect(
      policy({ EMAIL_VERIFICATION_REQUIRED: "false" }).required
    ).toBe(false);
  });

  it("rejects an ambiguous setting", () => {
    expect(() =>
      policy({ EMAIL_VERIFICATION_REQUIRED: "sometimes" })
    ).toThrow("EMAIL_VERIFICATION_REQUIRED must be true or false");
  });

  it("requires SMTP in production when verification is enabled", () => {
    expect(() =>
      policy({ NODE_ENV: "production" }).assertDeliveryConfigured(),
    ).toThrow();
    expect(() =>
      policy({
        NODE_ENV: "production",
        SMTP_HOST: "smtp.example.com",
      }).assertDeliveryConfigured(),
    ).not.toThrow();
  });

  it("allows the development log transport without SMTP", () => {
    expect(() =>
      policy({ NODE_ENV: "development" }).assertDeliveryConfigured(),
    ).not.toThrow();
  });

  it("builds an absolute, expiring verification link message", () => {
    const message = policy({
      APP_ORIGIN: "https://meet.example.com",
      SMTP_HOST: "smtp.example.com"
    }).message("CHANGE_EMAIL", "test token");

    expect(message.title).toContain("email");
    expect(message.body).toContain(
      "https://meet.example.com/verify-email?token=test+token"
    );
    expect(message.body).toContain("24");
  });
});
