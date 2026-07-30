import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req
} from "@nestjs/common";
import { Approved, Public } from "../auth/auth.decorators";
import type { AuthenticatedRequest } from "../common/types";
import {
  TelegramWebhookDto,
  UpdateNotificationPreferencesDto
} from "./notifications.dto";
import { NotificationsService } from "./notifications.service";

@Controller("api/notifications")
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Approved()
  @Get()
  async list(
    @Req() request: AuthenticatedRequest,
    @Query("page") page?: string,
    @Query("limit") limit?: string
  ) {
    return this.notifications.list(
      request.user.id,
      Number(page),
      Number(limit)
    );
  }

  @Approved()
  @Patch("read-all")
  @HttpCode(204)
  async markAllRead(@Req() request: AuthenticatedRequest): Promise<void> {
    await this.notifications.markAllRead(request.user.id);
  }

  @Approved()
  @Patch(":id/read")
  @HttpCode(204)
  async markRead(
    @Req() request: AuthenticatedRequest,
    @Param("id") id: string
  ): Promise<void> {
    await this.notifications.markRead(request.user.id, id);
  }

  @Get("preferences")
  async preferences(@Req() request: AuthenticatedRequest) {
    return this.notifications.getPreferences(request.user.id);
  }

  @Patch("preferences")
  async updatePreferences(
    @Req() request: AuthenticatedRequest,
    @Body() dto: UpdateNotificationPreferencesDto
  ) {
    return this.notifications.updatePreferences(request.user.id, dto);
  }

  @Post("telegram/link")
  createTelegramLink(@Req() request: AuthenticatedRequest) {
    return this.notifications.createTelegramLink(request.user.id);
  }

  @Delete("telegram")
  @HttpCode(204)
  async disconnectTelegram(
    @Req() request: AuthenticatedRequest
  ): Promise<void> {
    await this.notifications.disconnectTelegram(request.user.id);
  }

  @Public()
  @Post("telegram/webhook/:secret")
  async telegramWebhook(
    @Param("secret") secret: string,
    @Body() dto: TelegramWebhookDto
  ) {
    const chatId = dto.message?.chat?.id;
    return this.notifications.handleTelegramStart(
      secret,
      dto.message?.text,
      chatId === undefined ? undefined : String(chatId)
    );
  }
}
