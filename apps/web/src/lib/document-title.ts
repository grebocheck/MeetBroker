import type { MessageKey } from "../locales/uk";
import type { Locale } from "../types";
import { translate } from "./i18n";

export type ApplicationState =
  "LOADING" | "ANONYMOUS" | "EMAIL_VERIFICATION" | "APPROVAL" | "READY";

const authenticatedTitleKeys: Record<string, MessageKey> = {
  "/my-calendar": "myMeetings",
  "/calendar": "calendar",
  "/bookings": "myBookings",
  "/events": "openEvents",
  "/notifications": "notifications",
  "/profile": "profile",
};

export function currentRoute(path: string): string {
  return path.split("?")[0].replace(/\/+$/, "") || "/";
}

export function documentTitleKey(
  path: string,
  state: ApplicationState,
): MessageKey | null {
  if (state === "LOADING") return null;
  if (state === "EMAIL_VERIFICATION") return "approval.verifyTitle";
  if (state === "APPROVAL") return "approval.title";

  const route = currentRoute(path);
  if (state === "ANONYMOUS") {
    if (route === "/register") return "auth.registerTitle";
    if (route === "/verify-email") return "auth.verifyTitle";
    return "auth.loginTitle";
  }

  if (route.startsWith("/admin")) return "administration";
  return authenticatedTitleKeys[route] ?? "calendar";
}

export function buildDocumentTitle(
  locale: Locale,
  path: string,
  state: ApplicationState,
): string {
  const key = documentTitleKey(path, state);
  return key ? `${translate(locale, key)} — MeetBroker` : "MeetBroker";
}
