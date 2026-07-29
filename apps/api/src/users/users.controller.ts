import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseInterceptors
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { FileInterceptor } from "@nestjs/platform-express";
import type { AuthenticatedRequest } from "../common/types";
import { apiError } from "../common/http-error";
import { Approved } from "../auth/auth.decorators";
import { UpdateProfileDto } from "./users.dto";
import { UsersService } from "./users.service";

@Controller("api/users")
export class UsersController {
  private readonly maxAvatarBytes: number;

  constructor(
    private readonly users: UsersService,
    config: ConfigService
  ) {
    this.maxAvatarBytes = Number(config.get("MAX_AVATAR_BYTES") ?? 12_582_912);
  }

  @Patch("me")
  async updateProfile(
    @Req() request: AuthenticatedRequest,
    @Body() dto: UpdateProfileDto
  ) {
    return {
      user: await this.users.updateProfile(request.user.id, dto)
    };
  }

  @Post("me/avatar")
  @UseInterceptors(
    FileInterceptor("avatar", {
      limits: { fileSize: 12_582_912, files: 1 }
    })
  )
  uploadAvatar(
    @Req() request: AuthenticatedRequest,
    @UploadedFile() file: Express.Multer.File
  ) {
    if (!file || file.size > this.maxAvatarBytes) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        "AVATAR_REQUIRED",
        "Avatar file is required or is too large to process"
      );
    }
    return this.users.saveAvatar(request.user.id, file);
  }

  @Approved()
  @Get("colleagues")
  listColleagues(
    @Req() request: AuthenticatedRequest,
    @Query("search") search?: string
  ) {
    return {
      users: this.users.listColleagues(request.user.id, search)
    };
  }
}
