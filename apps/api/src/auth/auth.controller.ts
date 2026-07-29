import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Response } from "express";
import type { AuthenticatedRequest } from "../common/types";
import { Public } from "./auth.decorators";
import { LoginDto, RegisterDto, VerifyEmailDto } from "./auth.dto";
import { AuthService } from "./auth.service";

@Controller("api/auth")
export class AuthController {
  private readonly cookieName: string;
  private readonly secureCookie: boolean;

  constructor(
    private readonly auth: AuthService,
    config: ConfigService
  ) {
    this.cookieName =
      config.get<string>("SESSION_COOKIE_NAME") ?? "meetbroker_session";
    this.secureCookie = config.get<string>("NODE_ENV") === "production";
  }

  @Public()
  @Post("register")
  async register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Public()
  @Post("verify-email")
  @HttpCode(204)
  async verifyEmail(@Body() dto: VerifyEmailDto): Promise<void> {
    await this.auth.verifyEmail(dto.token);
  }

  @Public()
  @Post("login")
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) response: Response
  ) {
    const session = await this.auth.login(dto);
    response.cookie(this.cookieName, session.token, {
      httpOnly: true,
      sameSite: "lax",
      secure: this.secureCookie,
      expires: session.expiresAt,
      path: "/"
    });
    return { user: session.user };
  }

  @Post("logout")
  @HttpCode(204)
  async logout(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response
  ): Promise<void> {
    await this.auth.logout(request.sessionId);
    response.clearCookie(this.cookieName, { path: "/" });
  }

  @Get("me")
  me(@Req() request: AuthenticatedRequest) {
    return { user: request.user };
  }
}
