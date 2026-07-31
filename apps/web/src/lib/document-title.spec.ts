import { describe, expect, it } from "vitest";
import {
  buildDocumentTitle,
  currentRoute,
  documentTitleKey,
} from "./document-title";

describe("document title metadata", () => {
  it("normalizes query strings and trailing slashes", () => {
    expect(currentRoute("/notifications/?page=2")).toBe("/notifications");
  });

  it.each([
    ["/my-calendar", "myMeetings"],
    ["/calendar", "calendar"],
    ["/bookings", "myBookings"],
    ["/events", "openEvents"],
    ["/notifications?page=2", "notifications"],
    ["/profile", "profile"],
    ["/admin/rooms", "administration"],
  ] as const)("maps %s to its localized title key", (path, key) => {
    expect(documentTitleKey(path, "READY")).toBe(key);
  });

  it("describes authentication and approval states", () => {
    expect(documentTitleKey("/login", "ANONYMOUS")).toBe("auth.loginTitle");
    expect(documentTitleKey("/register", "ANONYMOUS")).toBe(
      "auth.registerTitle",
    );
    expect(documentTitleKey("/verify-email?token=test", "ANONYMOUS")).toBe(
      "auth.verifyTitle",
    );
    expect(documentTitleKey("/calendar", "EMAIL_VERIFICATION")).toBe(
      "approval.verifyTitle",
    );
    expect(documentTitleKey("/calendar", "APPROVAL")).toBe("approval.title");
  });

  it("builds titles in the active locale", () => {
    expect(buildDocumentTitle("uk", "/calendar", "READY")).toBe(
      "Розклад — MeetBroker",
    );
    expect(buildDocumentTitle("de", "/notifications", "READY")).toBe(
      "Benachrichtigungen — MeetBroker",
    );
    expect(buildDocumentTitle("ja", "/profile", "READY")).toBe(
      "プロフィール — MeetBroker",
    );
    expect(buildDocumentTitle("en", "/calendar", "LOADING")).toBe("MeetBroker");
  });
});
