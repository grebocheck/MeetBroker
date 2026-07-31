import { describe, expect, it, vi } from "vitest";
import type { CreateRoomBlockDto } from "./admin.dto";
import { RoomAvailabilityService } from "./room-availability.service";

function createService() {
  const client = {
    query: vi.fn(async (...args: unknown[]) => {
      void args;
      return { rows: [] as unknown[], rowCount: 1 };
    }),
  };
  const database = {
    query: vi.fn(async (...args: unknown[]) => {
      void args;
      return { rows: [] as unknown[], rowCount: 1 };
    }),
    transaction: vi.fn(
      async (callback: (connection: typeof client) => Promise<unknown>) =>
        callback(client),
    ),
  };
  const config = {
    get: vi.fn((key: string) =>
      key === "OFFICE_TIMEZONE" ? "Europe/Kyiv" : undefined,
    ),
  };
  return {
    client,
    database,
    service: new RoomAvailabilityService(database as never, config as never),
  };
}

function block(
  overrides: Partial<CreateRoomBlockDto> = {},
): CreateRoomBlockDto {
  return {
    roomId: "c25e4cdf-26c1-4a03-8218-c679b3c65cd9",
    title: "Maintenance",
    startsAt: "2026-03-27T07:00:00.000Z",
    endsAt: "2026-03-27T08:00:00.000Z",
    ...overrides,
  };
}

describe("RoomAvailabilityService", () => {
  it("rejects invalid ranges before accessing the database", async () => {
    const { database, service } = createService();

    await expect(
      service.create("actor-id", block({ endsAt: "2026-03-27T07:00:00.000Z" })),
    ).rejects.toMatchObject({
      response: {
        code: "INVALID_BLOCK_RANGE",
        message: "Room block time is invalid",
      },
      status: 400,
    });
    expect(database.query).not.toHaveBeenCalled();
    expect(database.transaction).not.toHaveBeenCalled();
  });

  it("keeps recurring wall-clock time stable across the Kyiv DST change", async () => {
    const { client, database, service } = createService();

    const result = await service.create(
      "actor-id",
      block({
        recurrence: "DAILY",
        recurrenceUntil: "2026-03-30",
      }),
    );

    expect(result.occurrenceCount).toBe(4);
    expect(database.transaction).toHaveBeenCalledOnce();
    const occurrenceStarts = client.query.mock.calls
      .slice(1)
      .map((call) => (call[1] as unknown[])[4] as Date)
      .map((date) => date.toISOString());
    expect(occurrenceStarts).toEqual([
      "2026-03-27T07:00:00.000Z",
      "2026-03-28T07:00:00.000Z",
      "2026-03-29T06:00:00.000Z",
      "2026-03-30T06:00:00.000Z",
    ]);
    expect(database.query).toHaveBeenLastCalledWith(expect.any(String), [
      expect.any(String),
      "actor-id",
      "ROOM_BLOCK_SERIES_CREATED",
      "ROOM_BLOCK_SERIES",
      result.id,
      expect.stringContaining('"occurrenceCount":4'),
    ]);
  });

  it("normalizes the room filter and maps the availability projection", async () => {
    const { database, service } = createService();
    const startsAt = new Date("2026-08-01T08:00:00.000Z");
    const endsAt = new Date("2026-08-01T09:00:00.000Z");
    database.query.mockResolvedValueOnce({
      rowCount: 1,
      rows: [
        {
          id: "block-id",
          kind: "SERIES",
          room_id: "room-id",
          room_name: "Dnipro",
          title: "Cleaning",
          private_note: null,
          starts_at: startsAt,
          ends_at: endsAt,
          frequency: "WEEKLY",
          recurrence_interval: 2,
          weekdays: [1, 3],
          recurrence_until: "2026-10-01",
          occurrence_count: "7",
        },
      ],
    });

    await expect(service.list("  room-id  ")).resolves.toEqual([
      {
        id: "block-id",
        kind: "SERIES",
        roomId: "room-id",
        roomName: "Dnipro",
        title: "Cleaning",
        privateNote: null,
        startsAt,
        endsAt,
        frequency: "WEEKLY",
        recurrenceInterval: 2,
        weekdays: [1, 3],
        recurrenceUntil: "2026-10-01",
        occurrenceCount: 7,
      },
    ]);
    expect(database.query).toHaveBeenCalledWith(expect.any(String), [
      "room-id",
    ]);
  });

  it("cancels a series and its future occurrences atomically", async () => {
    const { client, database, service } = createService();

    await service.cancel("actor-id", "series-id", "series");

    expect(database.transaction).toHaveBeenCalledOnce();
    expect(client.query).toHaveBeenNthCalledWith(1, expect.any(String), [
      "series-id",
      "actor-id",
    ]);
    expect(client.query).toHaveBeenNthCalledWith(2, expect.any(String), [
      "series-id",
    ]);
    expect(database.query).toHaveBeenCalledWith(expect.any(String), [
      expect.any(String),
      "actor-id",
      "ROOM_BLOCK_SERIES_CANCELLED",
      "ROOM_BLOCK_SERIES",
      "series-id",
      "{}",
    ]);
  });
});
