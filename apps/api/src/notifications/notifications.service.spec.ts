import { describe, expect, it, vi } from "vitest";
import { NotificationsService } from "./notifications.service";

describe("NotificationsService enqueue idempotency", () => {
  it("creates an in-app notification only for the first event key", async () => {
    const notificationValues = vi.fn(async () => undefined);
    const insert = vi
      .fn()
      .mockReturnValueOnce({
        values: () => ({
          onConflictDoNothing: () => ({
            returning: async () => [{ id: "outbox-id" }],
          }),
        }),
      })
      .mockReturnValueOnce({ values: notificationValues })
      .mockReturnValueOnce({
        values: () => ({
          onConflictDoNothing: () => ({
            returning: async () => [],
          }),
        }),
      });
    const orm = {
      insert,
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => [{ enabled: true }],
          }),
        }),
      }),
    };
    const service = new NotificationsService(
      { ormFor: () => orm } as never,
      {} as never,
      { get: () => undefined } as never,
    );
    const event = {
      eventKey: "booking:one:end-warning:user",
      userId: "user-id",
      type: "BOOKING_END_WARNING",
      category: "REMINDERS" as const,
      title: "Next slot is occupied",
      body: "Please finish on time",
      bookingId: "booking-id",
      activeBookingIds: ["booking-id", "next-booking-id"],
    };

    await service.enqueue({} as never, event);
    await service.enqueue({} as never, event);

    expect(notificationValues).toHaveBeenCalledTimes(1);
    expect(insert).toHaveBeenCalledTimes(3);
  });
});
