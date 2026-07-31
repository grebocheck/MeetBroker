import { describe, expect, it, vi } from "vitest";
import { BookingImagesService } from "./booking-images.service";

const owner = {
  id: "owner-id",
  role: "USER",
} as never;

function serviceWith(rows: unknown[]) {
  const clientQuery = vi.fn(async () => ({ rows: [], rowCount: 1 }));
  const database = {
    query: vi.fn(async () => ({ rows })),
    transaction: vi.fn(async (work: (client: unknown) => Promise<void>) =>
      work({ query: clientQuery }),
    ),
  };
  const service = new BookingImagesService(
    database as never,
    {
      get: () => "/tmp/meetbroker-booking-image-tests",
    } as never,
  );
  return { service, database, clientQuery };
}

describe("BookingImagesService access", () => {
  it("does not expose cancelled or missing bookings", async () => {
    const { service } = serviceWith([]);

    await expect(service.remove(owner, "missing")).rejects.toMatchObject({
      response: { code: "BOOKING_NOT_FOUND" },
      status: 404,
    });
  });

  it("allows only the organizer or an administrator to change an image", async () => {
    const booking = {
      organizer_id: "another-user",
      image_path: null,
      cancelled_at: null,
    };
    const denied = serviceWith([booking]);

    await expect(
      denied.service.remove(owner, "booking-id"),
    ).rejects.toMatchObject({
      response: { code: "NOT_BOOKING_OWNER" },
      status: 403,
    });

    const allowed = serviceWith([booking]);
    await allowed.service.remove(
      { id: "admin-id", role: "ADMIN" } as never,
      "booking-id",
    );
    expect(allowed.database.transaction).toHaveBeenCalledOnce();
    expect(allowed.clientQuery).toHaveBeenCalledTimes(2);
  });
});
