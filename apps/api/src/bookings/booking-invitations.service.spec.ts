import { describe, expect, it, vi } from "vitest";
import { BookingInvitationsService } from "./booking-invitations.service";

function createService() {
  const client = {
    query: vi.fn(async (...args: unknown[]) => {
      void args;
      return { rows: [] as unknown[], rowCount: 1 };
    }),
  };
  const database = {
    transaction: vi.fn(
      async (callback: (connection: typeof client) => Promise<unknown>) =>
        callback(client),
    ),
  };
  const bookingAttendees = {
    lock: vi.fn(),
    assertAvailable: vi.fn(),
  };
  return {
    bookingAttendees,
    client,
    database,
    service: new BookingInvitationsService(
      database as never,
      bookingAttendees as never,
    ),
  };
}

const invitation = {
  starts_at: new Date("2026-08-10T09:00:00.000Z"),
  ends_at: new Date("2026-08-10T10:00:00.000Z"),
};

describe("BookingInvitationsService", () => {
  it("returns the existing invitation-not-found contract before mutation", async () => {
    const { bookingAttendees, client, service } = createService();
    client.query
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });

    await expect(
      service.respond("user-id", "booking-id", { status: "ACCEPTED" }),
    ).rejects.toMatchObject({
      response: {
        code: "INVITATION_NOT_FOUND",
        message: "Active invitation was not found",
      },
      status: 404,
    });
    expect(client.query).toHaveBeenCalledTimes(2);
    expect(bookingAttendees.lock).not.toHaveBeenCalled();
  });

  it("checks attendee conflicts under locks before accepting", async () => {
    const { bookingAttendees, client, service } = createService();
    const conflict = new Error("busy");
    client.query
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [invitation], rowCount: 1 });
    bookingAttendees.assertAvailable.mockRejectedValueOnce(conflict);

    await expect(
      service.respond("user-id", "booking-id", { status: "ACCEPTED" }),
    ).rejects.toBe(conflict);
    expect(bookingAttendees.lock).toHaveBeenCalledWith(client, ["user-id"]);
    expect(bookingAttendees.assertAvailable).toHaveBeenCalledWith(
      client,
      ["user-id"],
      [invitation],
      ["booking-id"],
    );
    expect(client.query).toHaveBeenCalledTimes(2);
  });

  it("declines without availability checks and records the response", async () => {
    const { bookingAttendees, client, database, service } = createService();
    client.query
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [invitation], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });

    await service.respond("user-id", "booking-id", { status: "DECLINED" });

    expect(database.transaction).toHaveBeenCalledOnce();
    expect(bookingAttendees.lock).not.toHaveBeenCalled();
    expect(client.query).toHaveBeenNthCalledWith(3, expect.any(String), [
      "booking-id",
      "user-id",
      "DECLINED",
    ]);
    expect(client.query).toHaveBeenNthCalledWith(4, expect.any(String), [
      expect.any(String),
      "user-id",
      "BOOKING_INVITATION_DECLINED",
      "BOOKING",
      "booking-id",
      "{}",
    ]);
  });
});
