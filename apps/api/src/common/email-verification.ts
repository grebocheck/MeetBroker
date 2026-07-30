import { HttpStatus } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { apiError } from "./http-error";

export type EmailVerificationPurpose = "REGISTER" | "CHANGE_EMAIL";

export interface EmailVerificationMessage {
  title: string;
  body: string;
}

export class EmailVerificationPolicy {
  readonly required: boolean;
  private readonly appOrigin: string;
  private readonly smtpConfigured: boolean;

  constructor(config: ConfigService) {
    this.required = parseBoolean(
      config.get<string>("EMAIL_VERIFICATION_REQUIRED"),
      true
    );
    this.appOrigin =
      config.get<string>("APP_ORIGIN") ?? "http://localhost:8080";
    this.smtpConfigured = Boolean(config.get<string>("SMTP_HOST")?.trim());
  }

  assertDeliveryConfigured(): void {
    if (!this.required || this.smtpConfigured) return;
    throw apiError(
      HttpStatus.SERVICE_UNAVAILABLE,
      "EMAIL_DELIVERY_UNAVAILABLE",
      "Email verification is required, but SMTP delivery is not configured"
    );
  }

  message(
    purpose: EmailVerificationPurpose,
    token: string
  ): EmailVerificationMessage {
    const url = new URL("/verify-email", this.appOrigin);
    url.searchParams.set("token", token);
    if (purpose === "CHANGE_EMAIL") {
      return {
        title: "Підтвердіть нову email-адресу в MeetBroker",
        body: [
          "Ви запросили зміну email-адреси в MeetBroker.",
          `Підтвердьте нову адресу протягом 24 годин: ${url.toString()}`,
          "Якщо це були не ви, не переходьте за посиланням."
        ].join("\n\n")
      };
    }
    return {
      title: "Підтвердіть email у MeetBroker",
      body: [
        "Ваш профіль MeetBroker майже готовий.",
        `Підтвердьте email протягом 24 годин: ${url.toString()}`,
        "Після цього адміністратор зможе схвалити корпоративний доступ."
      ].join("\n\n")
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
