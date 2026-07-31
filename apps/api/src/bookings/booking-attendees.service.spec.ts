import { HttpException } from "@nestjs/common";
import type { PoolClient } from "pg";
import { describe, expect, it, vi } from "vitest";
import { BookingAttendeesService } from "./booking-attendees.service";

function clientWithQuery(query: ReturnType<typeof vi.fn>): PoolClient {
  return { query } as unknown as PoolClient;
}

describe("BookingAttendeesService", () => {
  const service = new BookingAttendeesService();

  it("locks unique attendee ids in stable order", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });

    await service.lock(clientWithQuery(query), ["user-b", "user-a", "user-b"]);

    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls.map((call) => call[1])).toEqual([
      ["user-a"],
      ["user-b"],
    ]);
  });

  it("skips conflict queries when there are no attendees", async () => {
    const query = vi.fn();

    await service.assertAvailable(
      clientWithQuery(query),
      [],
      [
        {
          startsAt: new Date("2026-07-31T09:00:00.000Z"),
          endsAt: new Date("2026-07-31T10:00:00.000Z"),
        },
      ],
    );

    expect(query).not.toHaveBeenCalled();
  });

  it("groups overlapping bookings into a structured conflict", async () => {
    const startsAt = new Date("2026-07-31T09:00:00.000Z");
    const endsAt = new Date("2026-07-31T10:00:00.000Z");
    const query = vi.fn().mockResolvedValue({
      rowCount: 2,
      rows: [
        {
          user_id: "user-a",
          user_name: "Anna",
          booking_id: "booking-a",
          booking_title: "Planning",
          starts_at: startsAt,
          ends_at: endsAt,
          requested_start: startsAt,
          relation: "PARTICIPANT",
        },
        {
          user_id: "user-a",
          user_name: "Anna",
          booking_id: "booking-b",
          booking_title: "Review",
          starts_at: startsAt,
          ends_at: endsAt,
          requested_start: startsAt,
          relation: "ORGANIZER",
        },
      ],
    });

    try {
      await service.assertAvailable(
        clientWithQuery(query),
        ["user-a", "user-a"],
        [{ startsAt, endsAt }],
        ["ignored-booking"],
      );
      throw new Error("Expected attendee conflict");
    } catch (error) {
      expect(error).toBeInstanceOf(HttpException);
      const response = (error as HttpException).getResponse();
      expect(response).toMatchObject({
        code: "ATTENDEE_BUSY",
        details: {
          conflicts: [
            {
              userId: "user-a",
              userName: "Anna",
              bookings: [
                { id: "booking-a", relation: "PARTICIPANT" },
                { id: "booking-b", relation: "ORGANIZER" },
              ],
            },
          ],
        },
      });
    }
    expect(query.mock.calls[0]?.[1]).toEqual([
      ["user-a"],
      JSON.stringify([
        {
          starts_at: startsAt.toISOString(),
          ends_at: endsAt.toISOString(),
        },
      ]),
      ["ignored-booking"],
    ]);
  });

  it("loads only eligible participant projections", async () => {
    const rows = [
      {
        id: "user-a",
        name: "Anna",
        locale: "uk" as const,
        timezone: "Europe/Kyiv",
      },
    ];
    const query = vi.fn().mockResolvedValue({ rows, rowCount: 1 });

    await expect(
      service.loadEligible(clientWithQuery(query), ["user-a"]),
    ).resolves.toEqual(rows);
    expect(query.mock.calls[0]?.[1]).toEqual([["user-a"]]);
  });
});
