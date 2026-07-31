import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { AuthenticatedRequest } from "../common/types";
import { apiError } from "../common/http-error";
import { MAX_UPLOAD_BYTES } from "../common/upload-policy";
import { Approved } from "../auth/auth.decorators";
import {
  ChangeEmailDto,
  ChangePasswordDto,
  UpdateProfileDto,
} from "./users.dto";
import { UsersService } from "./users.service";

@Controller("api/users")
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Patch("me")
  async updateProfile(
    @Req() request: AuthenticatedRequest,
    @Body() dto: UpdateProfileDto,
  ) {
    return {
      user: await this.users.updateProfile(request.user.id, dto),
    };
  }

  @Post("me/email-change")
  requestEmailChange(
    @Req() request: AuthenticatedRequest,
    @Body() dto: ChangeEmailDto,
  ) {
    return this.users.requestEmailChange(request.user.id, dto);
  }

  @Post("me/password-change")
  @HttpCode(204)
  async changePassword(
    @Req() request: AuthenticatedRequest,
    @Body() dto: ChangePasswordDto,
  ): Promise<void> {
    await this.users.changePassword(request.user.id, request.sessionId, dto);
  }

  @Post("me/avatar")
  @UseInterceptors(
    FileInterceptor("avatar", {
      limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
    }),
  )
  uploadAvatar(
    @Req() request: AuthenticatedRequest,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        "AVATAR_REQUIRED",
        "Avatar file is required or is too large to process",
      );
    }
    return this.users.saveAvatar(request.user.id, file);
  }

  @Approved()
  @Get("colleagues")
  async listColleagues(
    @Req() request: AuthenticatedRequest,
    @Query("search") search?: string,
  ) {
    return {
      users: await this.users.listColleagues(request.user.id, search),
    };
  }
}
