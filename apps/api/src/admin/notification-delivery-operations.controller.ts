import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import { AdminOnly, Approved } from "../auth/auth.decorators";
import type { AuthenticatedRequest } from "../common/types";
import { NotificationDeliveryOperationsService } from "./notification-delivery-operations.service";

@Approved()
@AdminOnly()
@Controller("api/admin/notification-deliveries")
export class NotificationDeliveryOperationsController {
  constructor(
    private readonly deliveries: NotificationDeliveryOperationsService,
  ) {}

  @Get()
  list(
    @Query("status") status?: string,
    @Query("search") search?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
  ) {
    return this.deliveries.list(status, search, Number(page), Number(limit));
  }

  @Post(":id/retry")
  @HttpCode(HttpStatus.NO_CONTENT)
  retry(
    @Req() request: AuthenticatedRequest,
    @Param("id") id: string,
  ): Promise<void> {
    return this.deliveries.retry(request.user.id, id);
  }
}
