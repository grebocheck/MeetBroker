import { IsBoolean, IsOptional, IsString } from "class-validator";

export class UpdateNotificationPreferencesDto {
  @IsOptional()
  @IsBoolean()
  emailEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  telegramEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  invitations?: boolean;

  @IsOptional()
  @IsBoolean()
  changes?: boolean;

  @IsOptional()
  @IsBoolean()
  reminders?: boolean;
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
