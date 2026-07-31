import { describe, expect, it } from "vitest";
import {
  calendarDayCount,
  clockMinutes,
  nextWorkingDate,
} from "./calendar.model";

describe("calendarDayCount", () => {
  it.each([
    [320, 2],
    [479, 2],
    [480, 3],
    [649, 3],
    [650, 4],
    [799, 4],
    [800, 5],
    [979, 5],
    [980, 6],
    [1219, 6],
    [1220, 7],
    [1600, 7],
  ])("shows %i days at %ipx", (width, expected) => {
    expect(calendarDayCount(width)).toBe(expected);
  });
});

describe("clockMinutes", () => {
  it("converts a clock value to minutes since midnight", () => {
    expect(clockMinutes("00:00")).toBe(0);
    expect(clockMinutes("09:30")).toBe(570);
    expect(clockMinutes("23:59")).toBe(1439);
  });
});

describe("nextWorkingDate", () => {
  it("skips a weekend and uses ISO weekday numbers", () => {
    const friday = new Date(2026, 6, 31, 12);
    expect(nextWorkingDate(friday, [1, 2, 3, 4, 5])).toEqual(
      new Date(2026, 7, 3, 12),
    );
  });

  it("falls back to the next day when no working days are configured", () => {
    const day = new Date(2026, 6, 30, 12);
    expect(nextWorkingDate(day, [])).toEqual(new Date(2026, 6, 31, 12));
  });
});
