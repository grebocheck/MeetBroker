import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import type { Response } from "express";

interface ErrorResponse {
  code?: string;
  message?: string | string[];
  details?: unknown;
}

@Catch()
export class ApiErrorFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const raw =
      exception instanceof HttpException
        ? exception.getResponse()
        : { message: "Internal server error" };
    const payload: ErrorResponse =
      typeof raw === "string" ? { message: raw } : (raw as ErrorResponse);

    if (!(exception instanceof HttpException)) {
      process.stderr.write(
        `${exception instanceof Error ? exception.stack : String(exception)}\n`,
      );
    }

    response.status(status).json({
      error: {
        code: payload.code ?? this.defaultCode(status),
        message: payload.message ?? "Request failed",
        details: payload.details,
      },
    });
  }

  private defaultCode(status: number): string {
    if (status === 400) return "VALIDATION_ERROR";
    if (status === 401) return "UNAUTHENTICATED";
    if (status === 403) return "FORBIDDEN";
    if (status === 404) return "NOT_FOUND";
    if (status === 409) return "CONFLICT";
    if (status === 413) return "PAYLOAD_TOO_LARGE";
    return "INTERNAL_ERROR";
  }
}
