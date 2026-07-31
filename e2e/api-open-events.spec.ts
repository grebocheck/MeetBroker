import {
  expect,
  request,
  test,
  type APIRequestContext,
} from "@playwright/test";
import { addDays, set } from "date-fns";
import { fromZonedTime, toZonedTime } from "date-fns-tz";
import { demoCredentials } from "./demo-credentials";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:8080";
const officeTimeZone = "Europe/Kyiv";

interface OpenEventsResponse {
  events: Array<{ id: string; title: string }>;
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

let user: APIRequestContext;

test.beforeAll(async () => {
  user = await request.newContext({ baseURL });
  const response = await user.post("/api/auth/login", {
    data: demoCredentials.user,
  });
  expect(response.ok()).toBe(true);
});

test.afterAll(async () => {
  await user.dispose();
});

test("paginates and searches open events without wildcard expansion", async () => {
  const marker = `Scale check ${Date.now()}`;
  const created = await createOpenEvents(marker, 2);

  try {
    const firstPage = await user.get(
      `/api/bookings/open?search=${encodeURIComponent(marker)}&page=1&limit=1`,
    );
    expect(firstPage.ok()).toBe(true);
    const first = (await firstPage.json()) as OpenEventsResponse;
    expect(first.events).toHaveLength(1);
    expect(first.pagination).toEqual({
      page: 1,
      limit: 1,
      total: 2,
      totalPages: 2,
    });

    const secondPage = await user.get(
      `/api/bookings/open?search=${encodeURIComponent(marker)}&page=2&limit=1`,
    );
    expect(secondPage.ok()).toBe(true);
    const second = (await secondPage.json()) as OpenEventsResponse;
    expect(second.events).toHaveLength(1);
    expect(second.events[0].id).not.toBe(first.events[0].id);

    const literalWildcard = await user.get(
      `/api/bookings/open?search=${encodeURIComponent("%")}`,
    );
    expect(literalWildcard.ok()).toBe(true);
    const literalBody = (await literalWildcard.json()) as OpenEventsResponse;
    expect(literalBody.events).toEqual([]);
    expect(literalBody.pagination.total).toBe(0);
  } finally {
    for (const id of created) {
      const cleanup = await user.delete(`/api/bookings/${id}`, {
        data: { reason: "Open-event pagination integration cleanup" },
      });
      expect(cleanup.ok()).toBe(true);
    }
  }
});

async function createOpenEvents(marker: string, count: number) {
  const ids: string[] = [];
  for (const startsAt of bookingCandidates()) {
    const endsAt = new Date(startsAt.getTime() + 30 * 60_000);
    const response = await user.post("/api/bookings", {
      data: {
        meetingType: "ONLINE",
        meetingUrl: "https://meet.example.test/scale-check",
        title: `${marker} ${ids.length + 1}`,
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        participationMode: "OPEN",
        participantIds: [],
      },
    });
    if (response.status() === 409) continue;
    expect(response.status()).toBe(201);
    const body = (await response.json()) as { id: string };
    ids.push(body.id);
    if (ids.length === count) return ids;
  }
  throw new Error("No available slots found for open-event pagination test");
}

function bookingCandidates(): Date[] {
  const result: Date[] = [];
  let localDate = toZonedTime(new Date(), officeTimeZone);
  while (result.length < 12) {
    localDate = addDays(localDate, 1);
    for (const hour of [10, 11, 12, 13, 14, 15]) {
      result.push(
        fromZonedTime(
          set(localDate, {
            hours: hour,
            minutes: 0,
            seconds: 0,
            milliseconds: 0,
          }),
          officeTimeZone,
        ),
      );
      if (result.length === 12) return result;
    }
  }
  return result;
}
