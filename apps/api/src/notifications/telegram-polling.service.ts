import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NotificationsService } from "./notifications.service";

interface TelegramUpdate {
  update_id: number;
  message?: {
    text?: string;
    chat?: {
      id?: number | string;
    };
  };
}

interface TelegramUpdatesResponse {
  ok: boolean;
  result?: TelegramUpdate[];
  description?: string;
}

type TelegramUpdateMode = "WEBHOOK" | "POLLING" | "DISABLED";

@Injectable()
export class TelegramPollingService {
  private readonly logger = new Logger(TelegramPollingService.name);
  private readonly token: string | undefined;
  private readonly mode: TelegramUpdateMode;
  private offset = 0;
  private lastError: string | null = null;

  constructor(
    private readonly notifications: NotificationsService,
    config: ConfigService
  ) {
    this.token = config.get<string>("TELEGRAM_BOT_TOKEN") || undefined;
    this.mode = parseUpdateMode(
      config.get<string>("TELEGRAM_UPDATE_MODE") ?? "WEBHOOK"
    );
  }

  isEnabled(): boolean {
    return this.mode === "POLLING" && Boolean(this.token);
  }

  async processUpdates(): Promise<number> {
    if (!this.isEnabled() || !this.token) return 0;
    try {
      const params = new URLSearchParams({
        timeout: "2",
        allowed_updates: JSON.stringify(["message"])
      });
      if (this.offset) params.set("offset", String(this.offset));
      const response = await fetch(
        `https://api.telegram.org/bot${this.token}/getUpdates?${params}`
      );
      const body = (await response.json()) as TelegramUpdatesResponse;
      if (!response.ok || !body.ok) {
        throw new Error(
          body.description ?? `Telegram getUpdates returned ${response.status}`
        );
      }

      const updates = body.result ?? [];
      let connected = 0;
      for (const update of updates) {
        this.offset = Math.max(this.offset, update.update_id + 1);
        const chatId = update.message?.chat?.id;
        const result = await this.notifications.connectTelegramStart(
          update.message?.text,
          chatId === undefined ? undefined : String(chatId)
        );
        if (result.connected) connected += 1;
      }
      if (this.lastError) {
        this.logger.log("Telegram polling recovered");
        this.lastError = null;
      }
      return connected;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error);
      if (message !== this.lastError) {
        this.logger.warn(`Telegram polling unavailable: ${message}`);
        this.lastError = message;
      }
      return 0;
    }
  }
}

function parseUpdateMode(value: string): TelegramUpdateMode {
  const normalized = value.trim().toUpperCase();
  if (
    normalized === "WEBHOOK" ||
    normalized === "POLLING" ||
    normalized === "DISABLED"
  ) {
    return normalized;
  }
  throw new Error(
    "TELEGRAM_UPDATE_MODE must be WEBHOOK, POLLING or DISABLED"
  );
}
