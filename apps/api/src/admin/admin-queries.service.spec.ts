import { describe, expect, it, vi } from "vitest";
import { AdminQueriesService } from "./admin-queries.service";

function createService() {
  const database = {
    query: vi.fn(async () => ({ rows: [] })),
  };
  return {
    database,
    service: new AdminQueriesService(database as never),
  };
}

describe("AdminQueriesService pagination", () => {
  it("uses user-list defaults for missing query parameters", async () => {
    const { database, service } = createService();

    const result = await service.users(undefined, undefined, NaN, NaN);

    expect(database.query).toHaveBeenNthCalledWith(1, expect.any(String), [
      "",
      "",
      12,
      0,
    ]);
    expect(database.query).toHaveBeenNthCalledWith(2, expect.any(String), [
      "",
      "",
    ]);
    expect(result.pagination).toEqual({
      page: 1,
      limit: 12,
      total: 0,
      totalPages: 1,
    });
  });

  it("normalizes user filters and clamps the maximum page size", async () => {
    const { database, service } = createService();

    const result = await service.users("unknown", "  Ada  ", 0, 500);

    expect(database.query).toHaveBeenNthCalledWith(1, expect.any(String), [
      "",
      "Ada",
      100,
      0,
    ]);
    expect(result.pagination).toMatchObject({ page: 1, limit: 100 });
  });

  it("normalizes booking pagination before calculating its offset", async () => {
    const { database, service } = createService();

    const result = await service.bookings(
      "upcoming",
      "  Release  ",
      " room-id ",
      4,
      0,
    );

    expect(database.query).toHaveBeenNthCalledWith(1, expect.any(String), [
      "upcoming",
      "Release",
      "room-id",
      1,
      3,
    ]);
    expect(result.pagination).toMatchObject({ page: 4, limit: 1 });
  });

  it("applies the audit-list fallback independently", async () => {
    const { database, service } = createService();

    const result = await service.auditLogs("unknown", " actor ", NaN, NaN);

    expect(database.query).toHaveBeenCalledWith(expect.any(String), [
      "",
      "actor",
      25,
      0,
    ]);
    expect(result.pagination).toEqual({
      page: 1,
      limit: 25,
      total: 0,
      totalPages: 1,
    });
  });
});
