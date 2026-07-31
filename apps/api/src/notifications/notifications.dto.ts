import { IsBoolean, IsIn, IsOptional, IsString } from "class-validator";
import {
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_CHANNELS,
  NotificationCategory,
  NotificationChannelName,
} from "./notification-channel";

export class UpdateNotificationPreferencesDto {
  @IsIn(NOTIFICATION_CATEGORIES)
  category!: NotificationCategory;

  @IsIn(NOTIFICATION_CHANNELS)
  channel!: NotificationChannelName;

  @IsBoolean()
  enabled!: boolean;
}

export class TelegramWebhookDto {
  message?: {
    text?: string;
    chat?: {
      id?: number | string;
    };
  };

  @IsOptional()
  @IsString()
  ignored?: string;
}
