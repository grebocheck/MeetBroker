import type { Request } from "express";

export type Role = "USER" | "ADMIN";
export type Theme = "SYSTEM" | "LIGHT" | "DARK";
export type Locale = "uk" | "en";

export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  bio: string | null;
  avatarPreset: string;
  avatarUrl: string | null;
  role: Role;
  locale: Locale;
  theme: Theme;
  timezone: string | null;
  emailVerified: boolean;
  approved: boolean;
  accessRevoked: boolean;
}

export interface AuthenticatedRequest extends Request {
  user: CurrentUser;
  sessionId: string;
}
