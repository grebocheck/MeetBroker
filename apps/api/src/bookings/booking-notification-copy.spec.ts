import { describe, expect, it } from "vitest";
import {
  bookingChangeCopy,
  bookingInvitationCopy,
  bookingRemovalCopy,
} from "./booking-notification-copy";

const recipient = {
  locale: "en" as const,
  timezone: "America/New_York",
};
const startsAt = new Date("2026-12-25T03:30:00.000Z");

describe("booking notification copy", () => {
  it("localizes a room invitation in the recipient timezone", () => {
    const copy = bookingInvitationCopy(
      "Alex",
      "Release planning",
      "Orion",
      startsAt,
      recipient,
      "Europe/Kyiv",
    );

    expect(copy.title).toBe("New meeting invitation");
    expect(copy.body).toContain("Alex");
    expect(copy.body).toContain("Release planning");
    expect(copy.body).toContain("Orion");
    expect(copy.body).toContain("24 December 2026");
    expect(copy.body).toContain("22:30");
  });

  it("uses the online variant for a location-free change", () => {
    const copy = bookingChangeCopy(
      "Design review",
      null,
      startsAt,
      recipient,
      "Europe/Kyiv",
    );

    expect(copy.title).toBe("Meeting details changed");
    expect(copy.body).toContain("online meeting");
    expect(copy.body).toContain("Design review");
  });

  it("builds participant removal copy without a date dependency", () => {
    expect(bookingRemovalCopy("Team sync", recipient)).toEqual({
      title: "Meeting participation changed",
      body: "You are no longer a participant of “Team sync”.",
    });
  });
});
