import { describe, expect, it } from "vitest";
import {
  intervalsOverlap,
  validateBookingRules,
  validateMeetingRules,
} from "./booking-rules";

describe("intervalsOverlap", () => {
  it("allows adjacent intervals", () => {
    expect(
      intervalsOverlap(
        new Date("2026-08-10T07:00:00Z"),
        new Date("2026-08-10T08:00:00Z"),
        new Date("2026-08-10T08:00:00Z"),
        new Date("2026-08-10T09:00:00Z")
      )
    ).toBe(false);
  });

  it("detects partial overlap", () => {
    expect(
      intervalsOverlap(
        new Date("2026-08-10T07:00:00Z"),
        new Date("2026-08-10T08:00:00Z"),
        new Date("2026-08-10T07:30:00Z"),
        new Date("2026-08-10T08:30:00Z")
      )
    ).toBe(true);
  });

  it("detects a full match", () => {
    const start = new Date("2026-08-10T07:00:00Z");
    const end = new Date("2026-08-10T08:00:00Z");
    expect(intervalsOverlap(start, end, start, end)).toBe(true);
  });

  it("does not overlap equal times on neighboring days", () => {
    expect(
      intervalsOverlap(
        new Date("2026-08-10T07:00:00Z"),
        new Date("2026-08-10T08:00:00Z"),
        new Date("2026-08-11T07:00:00Z"),
        new Date("2026-08-11T08:00:00Z")
      )
    ).toBe(false);
  });
});

describe("validateBookingRules", () => {
  it("accepts a valid Kyiv office interval", () => {
    expect(
      validateBookingRules({
        startsAt: new Date("2026-08-10T07:00:00Z"),
        endsAt: new Date("2026-08-10T08:00:00Z"),
        now: new Date("2026-08-01T00:00:00Z"),
        officeTimeZone: "Europe/Kyiv",
        workStart: "09:00",
        workEnd: "19:00",
        workingDays: [1, 2, 3, 4, 5]
      })
    ).toBeNull();
  });

  it("rejects a booking outside office hours", () => {
    expect(
      validateBookingRules({
        startsAt: new Date("2026-08-10T05:00:00Z"),
        endsAt: new Date("2026-08-10T06:00:00Z"),
        now: new Date("2026-08-01T00:00:00Z"),
        officeTimeZone: "Europe/Kyiv",
        workStart: "09:00",
        workEnd: "19:00",
        workingDays: [1, 2, 3, 4, 5]
      })
    ).toBe("OUTSIDE_WORKING_HOURS");
  });

  it("rejects a booking on a closed weekday", () => {
    expect(
      validateBookingRules({
        startsAt: new Date("2026-08-09T07:00:00Z"),
        endsAt: new Date("2026-08-09T08:00:00Z"),
        now: new Date("2026-08-01T00:00:00Z"),
        officeTimeZone: "Europe/Kyiv",
        workStart: "09:00",
        workEnd: "19:00",
        workingDays: [1, 2, 3, 4, 5]
      })
    ).toBe("OUTSIDE_WORKING_DAYS");
  });
});

describe("validateMeetingRules", () => {
  it("allows an online meeting outside room working hours", () => {
    expect(
      validateMeetingRules({
        startsAt: new Date("2026-08-10T04:00:00Z"),
        endsAt: new Date("2026-08-10T05:00:00Z"),
        now: new Date("2026-08-01T00:00:00Z"),
        officeTimeZone: "Europe/Kyiv",
      }),
    ).toBeNull();
  });

  it("still requires aligned slots and a supported duration", () => {
    expect(
      validateMeetingRules({
        startsAt: new Date("2026-08-10T07:15:00Z"),
        endsAt: new Date("2026-08-10T08:15:00Z"),
        now: new Date("2026-08-01T00:00:00Z"),
        officeTimeZone: "Europe/Kyiv",
      }),
    ).toBe("SLOT_ALIGNMENT");
  });
});
