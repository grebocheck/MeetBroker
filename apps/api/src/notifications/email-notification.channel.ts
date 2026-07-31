import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import nodemailer, { Transporter } from "nodemailer";
import {
  NotificationChannel,
  NotificationMessage,
  NotificationRecipient
} from "./notification-channel";
import { renderEmailHtml } from "./email-template";

@Injectable()
export class EmailNotificationChannel extends NotificationChannel {
  readonly name = "EMAIL" as const;
  private readonly logger = new Logger(EmailNotificationChannel.name);
  private readonly transporter: Transporter | null;
  private readonly from: string;
  private readonly allowDevelopmentLog: boolean;

  constructor(config: ConfigService) {
    super();
    const smtpHost = config.get<string>("SMTP_HOST");
    this.from =
      config.get<string>("SMTP_FROM") ??
      "MeetBroker <notifications@example.com>";
    this.allowDevelopmentLog =
      config.get<string>("NODE_ENV") !== "production";
    this.transporter = smtpHost
      ? nodemailer.createTransport({
          host: smtpHost,
          port: Number(config.get("SMTP_PORT") ?? 587),
          secure: String(config.get("SMTP_SECURE")) === "true",
          auth: config.get<string>("SMTP_USER")
            ? {
                user: config.get<string>("SMTP_USER"),
                pass: config.get<string>("SMTP_PASSWORD")
              }
            : undefined,
          disableFileAccess: true,
          disableUrlAccess: true
        })
      : null;
  }

  isAvailable(): boolean {
    return Boolean(this.transporter) || this.allowDevelopmentLog;
  }

  canDeliver(recipient: NotificationRecipient): boolean {
    return Boolean(recipient.email);
  }

  async deliver(
    recipient: NotificationRecipient,
    message: NotificationMessage
  ): Promise<void> {
    if (!this.transporter) {
      if (!this.allowDevelopmentLog) {
        throw new Error("SMTP delivery is not configured");
      }
      this.logger.log(
        `[dev-email] ${recipient.email}: ${message.title} — ${message.body}`
      );
      return;
    }
    await this.transporter.sendMail({
      from: this.from,
      to: recipient.email,
      subject: message.title,
      text: message.body,
      html: renderEmailHtml(message, recipient.locale)
    });
  }
}
