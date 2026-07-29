import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseInterceptors
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { FileInterceptor } from "@nestjs/platform-express";
import { AdminOnly, Approved } from "../auth/auth.decorators";
import { apiError } from "../common/http-error";
import type { AuthenticatedRequest } from "../common/types";
import {
  CreateRoomBlockDto,
  CreateRoomDto,
  RestrictUserDto,
  RevokeAccessDto,
  UpdateRoleDto,
  UpdateRoomDto
} from "./admin.dto";
import { AdminService } from "./admin.service";

@Approved()
@AdminOnly()
@Controller("api/admin")
export class AdminController {
  private readonly maxRoomImageBytes: number;

  constructor(
    private readonly admin: AdminService,
    config: ConfigService
  ) {
    this.maxRoomImageBytes = Number(
      config.get("MAX_ROOM_IMAGE_BYTES") ?? 12_582_912
    );
  }

  @Get("users")
  async users(
    @Query("status") status?: string,
    @Query("search") search?: string
  ) {
    return { users: await this.admin.users(status, search) };
  }

  @Get("bookings")
  async bookings(
    @Query("status") status?: string,
    @Query("search") search?: string,
    @Query("roomId") roomId?: string
  ) {
    return {
      bookings: await this.admin.bookings(status, search, roomId)
    };
  }

  @Post("users/:id/approve")
  @HttpCode(204)
  async approve(
    @Req() request: AuthenticatedRequest,
    @Param("id") id: string
  ): Promise<void> {
    await this.admin.approve(request.user.id, id);
  }

  @Post("users/:id/revoke")
  @HttpCode(204)
  async revokeAccess(
    @Req() request: AuthenticatedRequest,
    @Param("id") id: string,
    @Body() dto: RevokeAccessDto
  ): Promise<void> {
    await this.admin.revokeAccess(request.user.id, id, dto.reason.trim());
  }

  @Patch("users/:id/role")
  @HttpCode(204)
  async updateRole(
    @Req() request: AuthenticatedRequest,
    @Param("id") id: string,
    @Body() dto: UpdateRoleDto
  ): Promise<void> {
    await this.admin.updateRole(request.user.id, id, dto.role);
  }

  @Post("users/:id/restrictions")
  restrict(
    @Req() request: AuthenticatedRequest,
    @Param("id") id: string,
    @Body() dto: RestrictUserDto
  ) {
    return this.admin.restrict(request.user.id, id, dto);
  }

  @Delete("restrictions/:id")
  @HttpCode(204)
  async revokeRestriction(
    @Req() request: AuthenticatedRequest,
    @Param("id") id: string
  ): Promise<void> {
    await this.admin.revokeRestriction(request.user.id, id);
  }

  @Post("rooms")
  createRoom(
    @Req() request: AuthenticatedRequest,
    @Body() dto: CreateRoomDto
  ) {
    return this.admin.createRoom(request.user.id, dto);
  }

  @Patch("rooms/:id")
  @HttpCode(204)
  async updateRoom(
    @Req() request: AuthenticatedRequest,
    @Param("id") id: string,
    @Body() dto: UpdateRoomDto
  ): Promise<void> {
    await this.admin.updateRoom(request.user.id, id, dto);
  }

  @Post("rooms/:id/image")
  @UseInterceptors(
    FileInterceptor("image", {
      limits: { fileSize: 12_582_912, files: 1 }
    })
  )
  uploadRoomImage(
    @Req() request: AuthenticatedRequest,
    @Param("id") id: string,
    @UploadedFile() file: Express.Multer.File
  ) {
    if (!file || file.size > this.maxRoomImageBytes) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        "ROOM_IMAGE_REQUIRED",
        "Room image is required or is too large to process"
      );
    }
    return this.admin.saveRoomImage(request.user.id, id, file);
  }

  @Delete("rooms/:id/image")
  @HttpCode(204)
  async removeRoomImage(
    @Req() request: AuthenticatedRequest,
    @Param("id") id: string
  ): Promise<void> {
    await this.admin.removeRoomImage(request.user.id, id);
  }

  @Post("room-blocks")
  createRoomBlock(
    @Req() request: AuthenticatedRequest,
    @Body() dto: CreateRoomBlockDto
  ) {
    return this.admin.createRoomBlock(request.user.id, dto);
  }

  @Get("audit")
  async auditLogs(
    @Query("category") category?: string,
    @Query("search") search?: string
  ) {
    return { logs: await this.admin.auditLogs(category, search) };
  }
}
