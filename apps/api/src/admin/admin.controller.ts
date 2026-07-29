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
import { AdminOnly, Approved } from "../auth/auth.decorators";
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
  constructor(private readonly admin: AdminService) {}

  @Get("users")
  async users(
    @Query("status") status?: string,
    @Query("search") search?: string
  ) {
    return { users: await this.admin.users(status, search) };
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

  @Post("room-blocks")
  createRoomBlock(
    @Req() request: AuthenticatedRequest,
    @Body() dto: CreateRoomBlockDto
  ) {
    return this.admin.createRoomBlock(request.user.id, dto);
  }

  @Get("audit")
  async auditLogs() {
    return { logs: await this.admin.auditLogs() };
  }
}
