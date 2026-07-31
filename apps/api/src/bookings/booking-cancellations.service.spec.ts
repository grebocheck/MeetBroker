import { describe, expect, it, vi } from "vitest";
import type { CurrentUser } from "../common/types";
import { BookingCancellationsService } from "./booking-cancellations.service";

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
  const notifications = {
    enqueue: vi.fn(),
  };
  const accessPolicies = {
    assertAllowed: vi.fn(),
  };
  return {
    accessPolicies,
    client,
    database,
    notifications,
    service: new BookingCancellationsService(
      database as never,
      notifications as never,
      accessPolicies as never,
    ),
  };
}

function user(overrides: Partial<CurrentUser> = {}): CurrentUser {
  return {
    accessRevoked: false,
    approved: true,
    avatarPreset: "preset-1",
    avatarUrl: null,
    bio: null,
    email: "user@example.com",
    emailVerified: true,
    id: "user-id",
    locale: "uk",
    name: "User",
    pendingEmail: null,
    role: "USER",
    theme: "SYSTEM",
    timezone: "Europe/Kyiv",
    ...overrides,
  };
}

function booking(overrides: Record<string, unknown> = {}) {
  return {
    cancelled_at: null,
    id: "booking-id",
    organizer_id: "user-id",
    room_id: "room-id",
    series_id: null,
    starts_at: new Date("2026-08-10T09:00:00.000Z"),
    title: "Planning",
    ...overrides,
  };
}

describe("BookingCancellationsService", () => {
  it("preserves the booking-not-found contract before policy checks", async () => {
    const { accessPolicies, client, service } = createService();
    client.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    await expect(
      service.cancel(user(), "booking-id", { scope: "OCCURRENCE" }),
    ).rejects.toMatchObject({
      response: { code: "BOOKING_NOT_FOUND", message: "Booking was not found" },
      status: 404,
    });
    expect(accessPolicies.assertAllowed).not.toHaveBeenCalled();
    expect(client.query).toHaveBeenCalledOnce();
  });

  it("rejects a non-owner before mutating the booking", async () => {
    const { accessPolicies, client, service } = createService();
    client.query.mockResolvedValueOnce({
      rows: [booking({ organizer_id: "owner-id" })],
      rowCount: 1,
    });

    await expect(
      service.cancel(user(), "booking-id", { scope: "OCCURRENCE" }),
    ).rejects.toMatchObject({
      response: {
        code: "NOT_BOOKING_OWNER",
        message: "Only the organizer can cancel this booking",
      },
      status: 403,
    });
    expect(accessPolicies.assertAllowed).not.toHaveBeenCalled();
    expect(client.query).toHaveBeenCalledOnce();
  });

  it("requires an explicit reason for an administrative cancellation", async () => {
    const { accessPolicies, client, service } = createService();
    client.query.mockResolvedValueOnce({
      rows: [booking({ organizer_id: "owner-id" })],
      rowCount: 1,
    });

    await expect(
      service.cancel(user({ id: "admin-id", role: "ADMIN" }), "booking-id", {
        scope: "OCCURRENCE",
        reason: " ",
      }),
    ).rejects.toMatchObject({
      response: {
        code: "CANCELLATION_REASON_REQUIRED",
        message:
          "Administrator must provide a cancellation reason of at least 3 characters",
      },
      status: 400,
    });
    expect(accessPolicies.assertAllowed).not.toHaveBeenCalled();
    expect(client.query).toHaveBeenCalledOnce();
  });

  it("cancels an owned occurrence, notifies participants and records activity", async () => {
    const { accessPolicies, client, database, notifications, service } =
      createService();
    client.query
      .mockResolvedValueOnce({ rows: [booking()], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({
        rows: [{ user_id: "participant-id" }],
        rowCount: 1,
      })
      .mockResolvedValueOnce({
        rows: [{ id: "participant-id", locale: "uk" }],
        rowCount: 1,
      });

    await service.cancel(user(), "booking-id", {
      scope: "OCCURRENCE",
      reason: "Room changed",
    });

    expect(database.transaction).toHaveBeenCalledOnce();
    expect(accessPolicies.assertAllowed).toHaveBeenCalledWith(
      client,
      "user-id",
      "BOOKING_CANCEL_OWN",
      "room-id",
    );
    expect(client.query).toHaveBeenNthCalledWith(2, expect.any(String), [
      ["booking-id"],
      "user-id",
    ]);
    expect(notifications.enqueue).toHaveBeenCalledWith(
      client,
      expect.objectContaining({
        bookingId: "booking-id",
        category: "CHANGES",
        eventKey: "booking:booking-id:cancel:participant-id",
        type: "BOOKING_CANCELLED",
        userId: "participant-id",
      }),
    );
    expect(client.query).toHaveBeenNthCalledWith(5, expect.any(String), [
      expect.any(String),
      "user-id",
      "BOOKING_CANCELLED",
      "BOOKING",
      "booking-id",
      expect.stringContaining('"scope":"OCCURRENCE"'),
    ]);
  });
});
