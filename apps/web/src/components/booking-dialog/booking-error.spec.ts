import { describe, expect, it } from "vitest";
import { ApiError } from "../../lib/api";
import { translate, type Translator } from "../../lib/i18n";
import { bookingError } from "./booking-error";

const t: Translator = (key, variables) => translate("en", key, variables);

describe("booking dialog API errors", () => {
  it("maps field errors to the control that can resolve them", () => {
    expect(
      bookingError(
        new ApiError("MEETING_URL_REQUIRED", "invalid", 400),
        t,
        "en-GB",
      ),
    ).toEqual({
      target: "meetingUrl",
      message: t("booking.meetingUrlRequired"),
    });
  });

  it("includes a localized occurrence date for a failed series slot", () => {
    const result = bookingError(
      new ApiError("SLOT_TAKEN", "taken", 409, {
        startsAt: "2026-08-03T10:00:00.000Z",
      }),
      t,
      "en-GB",
    );

    expect(result?.target).toBe("time");
    expect(result?.message).toContain("3 Aug 2026");
  });

  it("summarizes every valid attendee conflict and ignores malformed data", () => {
    const result = bookingError(
      new ApiError("ATTENDEE_BUSY", "busy", 409, {
        conflicts: [
          {
            userName: "Anna",
            bookings: [
              {
                title: "Design review",
                startsAt: "2026-08-03T10:00:00.000Z",
              },
            ],
          },
          { userName: 42, bookings: null },
        ],
      }),
      t,
      "en-GB",
    );

    expect(result?.target).toBe("participants");
    expect(result?.message).toContain("Anna");
    expect(result?.message).toContain("Design review");
  });

  it("preserves a capability restriction reason", () => {
    expect(
      bookingError(
        new ApiError("CAPABILITY_RESTRICTED", "restricted", 403, {
          reason: "Temporary policy",
        }),
        t,
        "en-GB",
      )?.message,
    ).toContain("Temporary policy");
  });

  it("returns null for transport values that are not API errors", () => {
    expect(bookingError(new TypeError("offline"), t, "en-GB")).toBeNull();
  });
});
