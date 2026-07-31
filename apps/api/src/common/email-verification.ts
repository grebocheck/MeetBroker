import { HttpStatus } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { apiError } from "./http-error";
import { localize } from "./localization";
import type { Locale } from "./types";

export type EmailVerificationPurpose = "REGISTER" | "CHANGE_EMAIL";

export interface EmailVerificationMessage {
  title: string;
  body: string;
}

export class EmailVerificationPolicy {
  readonly required: boolean;
  private readonly appOrigin: string;
  private readonly smtpConfigured: boolean;
  private readonly developmentLogEnabled: boolean;

  constructor(config: ConfigService) {
    this.required = parseBoolean(
      config.get<string>("EMAIL_VERIFICATION_REQUIRED"),
      true,
    );
    this.appOrigin =
      config.get<string>("APP_ORIGIN") ?? "http://localhost:8080";
    this.smtpConfigured = Boolean(config.get<string>("SMTP_HOST")?.trim());
    this.developmentLogEnabled =
      config.get<string>("NODE_ENV") !== "production";
  }

  assertDeliveryConfigured(): void {
    if (
      !this.required ||
      this.smtpConfigured ||
      this.developmentLogEnabled
    ) {
      return;
    }
    throw apiError(
      HttpStatus.SERVICE_UNAVAILABLE,
      "EMAIL_DELIVERY_UNAVAILABLE",
      "Email verification is required, but SMTP delivery is not configured",
    );
  }

  message(
    purpose: EmailVerificationPurpose,
    token: string,
    locale: Locale = "uk",
  ): EmailVerificationMessage {
    const url = new URL("/verify-email", this.appOrigin);
    url.searchParams.set("token", token);
    if (purpose === "CHANGE_EMAIL") {
      return {
        title: localize(locale, "emailChangeTitle"),
        body: [
          localize(locale, "emailChangeIntro"),
          localize(locale, "emailChangeAction", { url: url.toString() }),
          localize(locale, "emailChangeAfter"),
        ].join("\n\n"),
      };
    }
    return {
      title: localize(locale, "emailRegisterTitle"),
      body: [
        localize(locale, "emailRegisterIntro"),
        localize(locale, "emailRegisterAction", { url: url.toString() }),
        localize(locale, "emailRegisterAfter"),
      ].join("\n\n"),
    };
  }
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value.trim() === "") return fallback;
  const normalized = value.trim().toLowerCase();
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  throw new Error("EMAIL_VERIFICATION_REQUIRED must be true or false");
}
