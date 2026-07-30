import { describe, expect, it } from "vitest";
import {
  buildBookingPayload,
  isHttpsUrl,
  nextHalfHour,
  validateBookingForm,
  type BookingFormValues,
} from "./booking-dialog.model";
import { validBookingImage } from "./BookingImageField";

const validValues: BookingFormValues = {
  meetingType: "ROOM",
  meetingUrl: "",
  title: "Release planning",
  startsAt: "2026-08-03T10:00",
  endsAt: "2026-08-03T11:00",
  participationMode: "INVITE_ONLY",
  participantIds: ["person-1"],
  recurrence: "NONE",
  recurrenceInterval: 1,
  recurrenceUntil: "2026-08-31",
  weekdays: [1],
  adminReason: "",
};

describe("booking dialog model", () => {
  it("accepts only complete HTTPS meeting links", () => {
    expect(isHttpsUrl("https://meet.example.com/room")).toBe(true);
    expect(isHttpsUrl("http://meet.example.com/room")).toBe(false);
    expect(isHttpsUrl("https://")).toBe(false);
    expect(isHttpsUrl("not a url")).toBe(false);
  });

  it("rounds a supplied time to the next half hour", () => {
    expect(nextHalfHour(new Date("2026-08-03T10:12:45")).getMinutes()).toBe(30);
    expect(nextHalfHour(new Date("2026-08-03T10:42:45")).getHours()).toBe(11);
    expect(nextHalfHour(new Date("2026-08-03T10:42:45")).getMinutes()).toBe(0);
  });

  it.each([
    [{ title: " " }, { target: "title", key: "booking.titleRequired" }],
    [
      { meetingType: "ONLINE", meetingUrl: "http://invalid.example" },
      { target: "meetingUrl", key: "booking.meetingUrlRequired" },
    ],
    [
      { endsAt: "2026-08-03T09:30" },
      { target: "time", key: "booking.endAfterStart" },
    ],
  ] as const)(
    "returns the first actionable validation issue",
    (change, issue) => {
      expect(
        validateBookingForm(
          { ...validValues, ...change },
          { editing: false, administrative: false },
        ),
      ).toEqual(issue);
    },
  );

  it("validates administrative and recurring-only fields contextually", () => {
    expect(
      validateBookingForm(
        { ...validValues, adminReason: "x" },
        { editing: true, administrative: true },
      ),
    ).toEqual({
      target: "adminReason",
      key: "booking.adminReasonRequired",
    });
    expect(
      validateBookingForm(
        { ...validValues, recurrence: "DAILY", recurrenceUntil: "" },
        { editing: false, administrative: false },
      ),
    ).toEqual({
      target: "recurrence",
      key: "booking.recurrenceEndRequired",
    });
    expect(
      validateBookingForm(
        { ...validValues, recurrence: "WEEKLY", weekdays: [] },
        { editing: false, administrative: false },
      ),
    ).toEqual({
      target: "recurrence",
      key: "booking.recurrenceWeekdaysRequired",
    });
  });

  it("builds a trimmed create payload without UI-only state", () => {
    expect(
      buildBookingPayload(
        {
          ...validValues,
          title: "  Release planning  ",
          recurrence: "WEEKLY",
          recurrenceInterval: 2,
          weekdays: [1, 3],
        },
        {
          editing: false,
          administrative: false,
          roomId: "room-1",
        },
      ),
    ).toMatchObject({
      meetingType: "ROOM",
      roomId: "room-1",
      title: "Release planning",
      participationMode: "INVITE_ONLY",
      participantIds: ["person-1"],
      recurrence: "WEEKLY",
      recurrenceInterval: 2,
      recurrenceUntil: "2026-08-31",
      weekdays: [1, 3],
    });
  });

  it("omits immutable create fields while editing", () => {
    const payload = buildBookingPayload(
      {
        ...validValues,
        recurrence: "DAILY",
        adminReason: "  Correct attendee list  ",
      },
      { editing: true, administrative: true, roomId: "room-1" },
    );

    expect(payload).not.toHaveProperty("meetingType");
    expect(payload).not.toHaveProperty("roomId");
    expect(payload).not.toHaveProperty("recurrence");
    expect(payload.adminReason).toBe("Correct attendee list");
  });

  it("validates image type and size without coupling it to the component", () => {
    expect(validBookingImage({ type: "image/webp", size: 1_000 } as File)).toBe(
      true,
    );
    expect(validBookingImage({ type: "text/plain", size: 1_000 } as File)).toBe(
      false,
    );
    expect(
      validBookingImage({
        type: "image/png",
        size: 20_000_000,
      } as File),
    ).toBe(false);
  });
});
