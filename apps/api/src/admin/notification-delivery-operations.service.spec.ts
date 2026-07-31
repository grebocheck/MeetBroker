import { describe, expect, it, vi } from "vitest";
import { NotificationDeliveryOperationsService } from "./notification-delivery-operations.service";

function serviceFor(
  delivery:
    | {
        id: string;
        status: "PENDING" | "PROCESSING" | "SENT" | "FAILED";
        attempts: number;
        eventType: string;
      }
    | undefined,
) {
  const updateWhere = vi.fn(async () => undefined);
  const updateSet = vi.fn(() => ({ where: updateWhere }));
  const selectFor = vi.fn(async () => (delivery ? [delivery] : []));
  const orm = {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => ({ for: selectFor }),
        }),
      }),
    }),
    update: () => ({ set: updateSet }),
  };
  const query = vi.fn(async () => ({ rows: [], rowCount: 1 }));
  const client = { query };
  const database = {
    ormFor: () => orm,
    transaction: (callback: (value: typeof client) => Promise<void>) =>
      callback(client),
  };
  return {
    service: new NotificationDeliveryOperationsService(database as never),
    query,
    updateSet,
    updateWhere,
  };
}

describe("NotificationDeliveryOperationsService retry", () => {
  it("requeues a failed delivery and records an audit event", async () => {
    const { service, query, updateSet, updateWhere } = serviceFor({
      id: "delivery-id",
      status: "FAILED",
      attempts: 8,
      eventType: "BOOKING_INVITATION",
    });

    await service.retry("actor-id", "delivery-id");

    expect(updateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "PENDING",
        attempts: 0,
        lastError: null,
        processedAt: null,
      }),
    );
    expect(updateWhere).toHaveBeenCalledOnce();
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("insert into audit_logs"),
      expect.arrayContaining([
        expect.any(String),
        "actor-id",
        "NOTIFICATION_DELIVERY_RETRIED",
        "NOTIFICATION_DELIVERY",
        "delivery-id",
      ]),
    );
  });

  it("does not retry a delivery that was already sent", async () => {
    const { service, updateSet } = serviceFor({
      id: "delivery-id",
      status: "SENT",
      attempts: 1,
      eventType: "BOOKING_UPDATED",
    });

    await expect(
      service.retry("actor-id", "delivery-id"),
    ).rejects.toMatchObject({
      response: { code: "NOTIFICATION_DELIVERY_NOT_FAILED" },
    });
    expect(updateSet).not.toHaveBeenCalled();
  });
});
