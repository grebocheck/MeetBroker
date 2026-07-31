import { describe, expect, it, vi } from "vitest";
import type { CurrentUser } from "../common/types";
import type { CreateBookingDto } from "./bookings.dto";
import { BookingCreationService } from "./booking-creation.service";

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

function booking(overrides: Partial<CreateBookingDto> = {}): CreateBookingDto {
  return {
    endsAt: "2026-08-10T10:00:00.000Z",
    meetingType: "ROOM",
    participantIds: [],
    roomId: "c25e4cdf-26c1-4a03-8218-c679b3c65cd9",
    startsAt: "2026-08-10T09:00:00.000Z",
    title: "Planning",
    ...overrides,
  };
}

function createService() {
  const database = { transaction: vi.fn(), query: vi.fn() };
  const service = new BookingCreationService(
    database as never,
    { enqueue: vi.fn() } as never,
    { assertAllowed: vi.fn() } as never,
    { lock: vi.fn(), assertAvailable: vi.fn(), insert: vi.fn() } as never,
    { get: () => "Europe/Kyiv" } as never,
  );
  return { database, service };
}

describe("BookingCreationService validation", () => {
  it.each([
    [booking({ title: " " }), "TITLE_REQUIRED"],
    [booking({ roomId: undefined }), "ROOM_REQUIRED"],
    [
      booking({ meetingType: "ONLINE", meetingUrl: "http://example.com" }),
      "MEETING_URL_REQUIRED",
    ],
    [booking({ recurrence: "DAILY" }), "RECURRENCE_END_REQUIRED"],
  ])("rejects invalid creation input before SQL", async (dto, code) => {
    const { database, service } = createService();

    await expect(service.create(currentUser(), dto)).rejects.toMatchObject({
      response: { code },
      status: 400,
    });
    expect(database.transaction).not.toHaveBeenCalled();
    expect(database.query).not.toHaveBeenCalled();
  });
});
