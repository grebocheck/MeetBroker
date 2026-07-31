import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  NotificationChannel,
  NotificationMessage,
  NotificationRecipient,
} from "./notification-channel";
import { renderTelegramMessage } from "./telegram-template";

@Injectable()
export class TelegramNotificationChannel extends NotificationChannel {
  readonly name = "TELEGRAM" as const;
  private readonly token: string | undefined;

  constructor(config: ConfigService) {
    super();
    this.token = config.get<string>("TELEGRAM_BOT_TOKEN") || undefined;
  }

  isAvailable(): boolean {
    return Boolean(this.token);
  }

  canDeliver(recipient: NotificationRecipient): boolean {
    return Boolean(recipient.telegramChatId && this.token);
  }

  async deliver(
    recipient: NotificationRecipient,
    message: NotificationMessage,
  ): Promise<void> {
    if (!this.token || !recipient.telegramChatId) return;
    const response = await fetch(
      `https://api.telegram.org/bot${this.token}/sendMessage`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          chat_id: recipient.telegramChatId,
          text: renderTelegramMessage(message, recipient.locale),
          parse_mode: "HTML",
          disable_web_page_preview: true,
        }),
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (!response.ok) {
      throw new Error(`Telegram returned ${response.status}`);
    }
  }
}
