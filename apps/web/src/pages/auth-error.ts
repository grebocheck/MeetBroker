import { ApiError } from "../lib/api";

export type AuthField = "name" | "email" | "password";
export type AuthFlow = "login" | "register";

const registerTargets: Partial<Record<string, AuthField>> = {
  EMAIL_TAKEN: "email",
  NAME_REQUIRED: "name",
  PASSWORD_LENGTH: "password",
};

export function authErrorTarget(
  error: unknown,
  flow: AuthFlow,
): AuthField | "form" {
  if (!(error instanceof ApiError)) return "form";
  if (flow === "login" && error.code === "INVALID_CREDENTIALS") {
    return "password";
  }
  if (flow === "register") return registerTargets[error.code] ?? "form";
  return "form";
}
