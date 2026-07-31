import { ConfigService } from "@nestjs/config";
import { describe, expect, it, vi } from "vitest";
import { NotificationWorkerService } from "./notification-worker.service";

function queryResult(rows: unknown[]) {
  const query: Record<string, unknown> = {};
  for (const method of ["from", "leftJoin", "where", "limit"]) {
    query[method] = () => query;
  }
  query.then = (
    resolve: (value: unknown[]) => unknown,
    reject: (reason: unknown) => unknown,
  ) => Promise.resolve(rows).then(resolve, reject);
  return query;
}

function workerWith(results: unknown[][]) {
  const deliver = vi.fn(async () => undefined);
  const channel = {
    isAvailable: () => true,
    canDeliver: () => true,
    deliver,
  };
  const select = vi.fn(() => queryResult(results.shift() ?? []));
  const worker = new NotificationWorkerService(
    { orm: { select } } as never,
    {} as never,
    { get: () => channel } as never,
    new ConfigService({ NOTIFY_BEFORE_MINUTES: "10" }),
  );
  return { worker, deliver, select };
}

const payload = {
  userId: "user-id",
  category: "REMINDERS" as const,
  title: "Next slot is occupied",
  body: "Please finish on time",
  activeBookingIds: ["booking-id", "next-booking-id"],
};

async function deliverPayload(worker: NotificationWorkerService) {
  await (
    worker as unknown as {
      deliver: (value: typeof payload, eventType: string) => Promise<void>;
    }
  ).deliver(payload, "BOOKING_END_WARNING");
}

describe("NotificationWorkerService booking eligibility", () => {
  it("does not deliver when either related booking was cancelled", async () => {
    const { worker, deliver, select } = workerWith([[{ count: 1 }]]);

    await deliverPayload(worker);

    expect(deliver).not.toHaveBeenCalled();
    expect(select).toHaveBeenCalledTimes(1);
  });

  it("delivers when both related bookings are still active", async () => {
    const { worker, deliver, select } = workerWith([
      [{ count: 2 }],
      [
        {
          email: "user@example.com",
          locale: "en",
          telegramChatId: null,
        },
      ],
      [{ channel: "EMAIL" }],
    ]);

    await deliverPayload(worker);

    expect(select).toHaveBeenCalledTimes(3);
    expect(deliver).toHaveBeenCalledOnce();
  });
});
