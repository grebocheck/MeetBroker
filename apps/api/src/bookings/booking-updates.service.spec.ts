import { describe, expect, it, vi } from "vitest";
import type { CurrentUser } from "../common/types";
import { BookingUpdatesService } from "./booking-updates.service";

function currentUser(): CurrentUser {
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
  };
}

function createService() {
  const client = {
    query: vi.fn(async (...args: unknown[]) => {
      void args;
      return { rows: [] as unknown[], rowCount: 0 };
    }),
  };
  const database = {
    transaction: vi.fn(
      async (callback: (connection: typeof client) => Promise<unknown>) =>
        callback(client),
    ),
  };
  const service = new BookingUpdatesService(
    database as never,
    { enqueue: vi.fn() } as never,
    { assertAllowed: vi.fn() } as never,
    { lock: vi.fn(), assertAvailable: vi.fn(), insert: vi.fn() } as never,
    { get: () => "Europe/Kyiv" } as never,
  );
  return { client, database, service };
}

describe("BookingUpdatesService validation", () => {
  it("rejects an empty title before opening a transaction", async () => {
    const { database, service } = createService();

    await expect(
      service.update(currentUser(), "booking-id", {
        endsAt: "2026-08-10T10:00:00.000Z",
        participantIds: [],
        participationMode: "INVITE_ONLY",
        startsAt: "2026-08-10T09:00:00.000Z",
        title: " ",
      }),
    ).rejects.toMatchObject({
      response: { code: "TITLE_REQUIRED" },
      status: 400,
    });
    expect(database.transaction).not.toHaveBeenCalled();
  });

  it("preserves the booking-not-found contract", async () => {
    const { client, service } = createService();

    await expect(
      service.update(currentUser(), "booking-id", {
        endsAt: "2026-08-10T10:00:00.000Z",
        participantIds: [],
        participationMode: "INVITE_ONLY",
        startsAt: "2026-08-10T09:00:00.000Z",
        title: "Planning",
      }),
    ).rejects.toMatchObject({
      response: { code: "BOOKING_NOT_FOUND", message: "Booking was not found" },
      status: 404,
    });
    expect(client.query).toHaveBeenCalledOnce();
  });
});
