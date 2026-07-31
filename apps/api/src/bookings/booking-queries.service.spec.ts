import { describe, expect, it, vi } from "vitest";
import { BookingQueriesService } from "./booking-queries.service";

function createService() {
  const database = {
    query: vi.fn(),
  };
  const accessPolicies = {
    assertAllowed: vi.fn(),
  };
  const service = new BookingQueriesService(
    database as never,
    accessPolicies as never,
    { get: () => "Europe/Kyiv" } as never,
  );
  return { service, database, accessPolicies };
}

describe("BookingQueriesService ranges", () => {
  it.each([
    ["not-a-date", "2026-08-01T10:00:00.000Z"],
    ["2026-08-01T10:00:00.000Z", "2026-08-01T10:00:00.000Z"],
    ["2026-08-02T10:00:00.000Z", "2026-08-01T10:00:00.000Z"],
    ["2026-08-01T10:00:00.000Z", "2026-09-03T10:00:00.001Z"],
  ])("rejects invalid schedule range %s — %s", async (from, to) => {
    const { service, database, accessPolicies } = createService();

    await expect(
      service.schedule("user-id", "room-id", from, to),
    ).rejects.toMatchObject({
      response: {
        code: "INVALID_RANGE",
        message: "Schedule range is invalid",
      },
      status: 400,
    });
    expect(accessPolicies.assertAllowed).not.toHaveBeenCalled();
    expect(database.query).not.toHaveBeenCalled();
  });

  it("preserves the calendar-specific invalid range message", async () => {
    const { service, database, accessPolicies } = createService();

    await expect(
      service.myCalendar("user-id", "invalid", "invalid"),
    ).rejects.toMatchObject({
      response: {
        code: "INVALID_RANGE",
        message: "Calendar range is invalid",
      },
      status: 400,
    });
    expect(accessPolicies.assertAllowed).not.toHaveBeenCalled();
    expect(database.query).not.toHaveBeenCalled();
  });
});
