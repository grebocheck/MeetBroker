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

describe("NotificationsService Telegram webhook", () => {
  const secret = "telegram_webhook_secret_with_32_chars";

  function serviceFor(mode: string, configuredSecret = secret) {
    const values: Record<string, string> = {
      TELEGRAM_UPDATE_MODE: mode,
      TELEGRAM_WEBHOOK_SECRET: configuredSecret,
    };
    return new NotificationsService(
      {} as never,
      {} as never,
      { get: (key: string) => values[key] } as never,
    );
  }

  it("accepts the configured Telegram header secret in webhook mode", async () => {
    const service = serviceFor("WEBHOOK");
    const connect = vi
      .spyOn(service, "connectTelegramStart")
      .mockResolvedValue({ connected: true, chatId: "42" });

    await expect(
      service.handleTelegramStart(secret, "/start token", "42"),
    ).resolves.toEqual({ connected: true, chatId: "42" });
    expect(connect).toHaveBeenCalledWith("/start token", "42");
  });

  it("hides the endpoint for invalid secrets and non-webhook modes", async () => {
    await expect(
      serviceFor("WEBHOOK").handleTelegramStart(
        "incorrect-secret-of-the-same-length",
        "/start token",
        "42",
      ),
    ).rejects.toMatchObject({
      response: { code: "NOT_FOUND" },
    });
    await expect(
      serviceFor("POLLING").handleTelegramStart(secret, "/start token", "42"),
    ).rejects.toMatchObject({
      response: { code: "NOT_FOUND" },
    });
  });
});
