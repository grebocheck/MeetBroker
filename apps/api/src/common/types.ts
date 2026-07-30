import type { Request } from "express";

export type Role = "USER" | "ADMIN";
export type Theme = "SYSTEM" | "LIGHT" | "DARK";
export type Locale = "uk" | "en";
export type Capability =
  | "BOOKING_CREATE"
  | "BOOKING_CANCEL_OWN"
  | "SCHEDULE_VIEW"
  | "ACCOUNT_LOGIN";

export interface ActiveRestriction {
  id: string;
  capability: Capability;
  roomId: string | null;
  reason: string;
  startsAt: Date;
  expiresAt: Date | null;
}

export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  pendingEmail: string | null;
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
  activeRestrictions?: ActiveRestriction[];
}

export interface AuthenticatedRequest extends Request {
  user: CurrentUser;
  sessionId: string;
}
