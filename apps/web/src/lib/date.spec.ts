import { describe, expect, it } from "vitest";
import { dateKeyInZone, officeLocalToInstant } from "./date";

describe("officeLocalToInstant", () => {
  it("stores the same Kyiv wall time as different UTC instants across DST", () => {
    const winter = officeLocalToInstant(
      new Date(2026, 0, 12),
      9,
      0,
      "Europe/Kyiv",
    );
    const summer = officeLocalToInstant(
      new Date(2026, 6, 13),
      9,
      0,
      "Europe/Kyiv",
    );

    expect(winter.toISOString()).toBe("2026-01-12T07:00:00.000Z");
    expect(summer.toISOString()).toBe("2026-07-13T06:00:00.000Z");
  });

  it("moves the displayed day when the user timezone crosses midnight", () => {
    const officeMondayStart = officeLocalToInstant(
      new Date(2026, 6, 27),
      9,
      0,
      "Europe/Kyiv",
    );

    expect(dateKeyInZone(officeMondayStart, "Europe/Kyiv")).toBe("2026-07-27");
    expect(dateKeyInZone(officeMondayStart, "America/Los_Angeles")).toBe(
      "2026-07-26",
    );
  });
});
