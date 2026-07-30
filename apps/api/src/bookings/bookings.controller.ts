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
import { Approved } from "../auth/auth.decorators";
import type { AuthenticatedRequest } from "../common/types";
import {
  CancelBookingDto,
  CreateBookingDto,
  RespondToInvitationDto,
  UpdateBookingDto
} from "./bookings.dto";
import { BookingsService } from "./bookings.service";

@Approved()
@Controller("api/bookings")
export class BookingsController {
  constructor(private readonly bookings: BookingsService) {}

  @Get("schedule")
  schedule(
    @Req() request: AuthenticatedRequest,
    @Query("roomId") roomId: string,
    @Query("from") from: string,
    @Query("to") to: string
  ) {
    return this.bookings.schedule(request.user.id, roomId, from, to);
  }

  @Post()
  create(
    @Req() request: AuthenticatedRequest,
    @Body() dto: CreateBookingDto
  ) {
    return this.bookings.create(request.user, dto);
  }

  @Get("mine")
  async mine(
    @Req() request: AuthenticatedRequest,
    @Query("section") sectionRaw?: string,
    @Query("offset") offsetRaw?: string
  ) {
    const section = sectionRaw === "past" ? "past" : "future";
    const offset = Number(offsetRaw ?? 0);
    return this.bookings.mine(
      request.user.id,
      section,
      Number.isInteger(offset) ? offset : 0
    );
  }

  @Get("my-calendar")
  myCalendar(
    @Req() request: AuthenticatedRequest,
    @Query("from") from: string,
    @Query("to") to: string
  ) {
    return this.bookings.myCalendar(request.user.id, from, to);
  }

  @Patch(":id")
  @HttpCode(204)
  async update(
    @Req() request: AuthenticatedRequest,
    @Param("id") id: string,
    @Body() dto: UpdateBookingDto
  ): Promise<void> {
    await this.bookings.update(request.user, id, dto);
  }

  @Get("open")
  async openEvents(@Req() request: AuthenticatedRequest) {
    return {
      events: await this.bookings.openEvents(request.user.id)
    };
  }

  @Post(":id/respond")
  @HttpCode(204)
  async respond(
    @Req() request: AuthenticatedRequest,
    @Param("id") id: string,
    @Body() dto: RespondToInvitationDto
  ): Promise<void> {
    await this.bookings.respond(request.user.id, id, dto);
  }

  @Post(":id/join")
  @HttpCode(204)
  async join(
    @Req() request: AuthenticatedRequest,
    @Param("id") id: string
  ): Promise<void> {
    await this.bookings.joinOpenEvent(request.user.id, id);
  }

  @Delete(":id/join")
  @HttpCode(204)
  async leave(
    @Req() request: AuthenticatedRequest,
    @Param("id") id: string
  ): Promise<void> {
    await this.bookings.leaveOpenEvent(request.user.id, id);
  }

  @Delete(":id")
  @HttpCode(204)
  async cancel(
    @Req() request: AuthenticatedRequest,
    @Param("id") id: string,
    @Body() dto: CancelBookingDto
  ): Promise<void> {
    await this.bookings.cancel(request.user, id, dto);
  }
}
