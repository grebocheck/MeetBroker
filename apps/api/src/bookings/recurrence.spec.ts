import { describe, expect, it } from "vitest";
import { fromZonedTime, toZonedTime } from "date-fns-tz";
import { buildRecurrenceOccurrences, RecurrenceError } from "./recurrence";

describe("buildRecurrenceOccurrences", () => {
  it("preserves the selected wall-clock time across daylight saving changes", () => {
    const timeZone = "Europe/Kyiv";
    const startsAt = fromZonedTime("2026-03-23T10:00:00", timeZone);
    const occurrences = buildRecurrenceOccurrences({
      startsAt,
      endsAt: new Date(startsAt.getTime() + 30 * 60_000),
      frequency: "WEEKLY",
      interval: 1,
      weekdays: [1],
      until: "2026-04-06",
      timeZone,
    });

    expect(occurrences).toHaveLength(3);
    expect(
      occurrences.map((occurrence) =>
        toZonedTime(occurrence.startsAt, timeZone).getHours(),
      ),
    ).toEqual([10, 10, 10]);
    expect(
      occurrences.map((occurrence) => occurrence.startsAt.getUTCHours()),
    ).toEqual([8, 7, 7]);
  });

  it("rejects a series that exceeds the configured occurrence limit", () => {
    const startsAt = new Date("2026-08-03T09:00:00Z");

    expect(() =>
      buildRecurrenceOccurrences({
        startsAt,
        endsAt: new Date(startsAt.getTime() + 30 * 60_000),
        frequency: "DAILY",
        interval: 1,
        weekdays: null,
        until: "2026-08-10",
        timeZone: "UTC",
        maxOccurrences: 3,
      }),
    ).toThrowError(new RecurrenceError("TOO_MANY"));
  });
});
