import { HttpException, HttpStatus } from "@nestjs/common";

export function apiError(
  status: HttpStatus,
  code: string,
  message: string,
  details?: unknown,
): HttpException {
  return new HttpException({ code, message, details }, status);
}
