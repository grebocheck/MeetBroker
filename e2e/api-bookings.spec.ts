import {
  expect,
  request,
  test,
  type APIRequestContext,
  type APIResponse,
} from "@playwright/test";
import { addDays, set } from "date-fns";
import { fromZonedTime, toZonedTime } from "date-fns-tz";

const baseURL =
  process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:8080";
const officeTimeZone = "Europe/Kyiv";

let owner: APIRequestContext;
let colleague: APIRequestContext;
let roomId: string;

test.beforeAll(async () => {
  owner = await authenticatedContext("user@meetbroker.local", "User12345!");
  colleague = await authenticatedContext(
    "anna@meetbroker.local",
    "User12345!",
  );
  const roomsResponse = await owner.get("/api/rooms");
  expect(roomsResponse.ok()).toBe(true);
  const rooms = (await roomsResponse.json()) as {
    rooms: Array<{ id: string; name: string }>;
  };
  roomId =
    rooms.rooms.find(({ name }) => name === "Обрій")?.id ??
    rooms.rooms.at(-1)?.id ??
    "";
  expect(roomId).not.toBe("");
});

test.afterAll(async () => {
  await Promise.all([owner.dispose(), colleague.dispose()]);
});

test("validates past time and room working hours", async () => {
  const pastStart = new Date(Date.now() - 24 * 60 * 60_000);
  pastStart.setUTCMinutes(0, 0, 0);
  const past = await createBooking(
    owner,
    pastStart,
    new Date(pastStart.getTime() + 30 * 60_000),
    "API integration: past",
  );
  expect(past.status()).toBe(400);
  await expectApiError(past, "PAST");

  const validStart = bookingCandidates(1)[0];
  const outsideStart = new Date(validStart.getTime() - 8 * 60 * 60_000);
  const outside = await createBooking(
    owner,
    outsideStart,
    new Date(outsideStart.getTime() + 30 * 60_000),
    "API integration: outside hours",
  );
  expect(outside.status()).toBe(400);
  await expectApiError(outside, "OUTSIDE_WORKING_HOURS");
});

test("creates, updates, lists and cancels an owned booking", async () => {
  const created = await createInAvailableSlot(
    owner,
    "API integration lifecycle",
  );
  const bookingId = created.body.id;

  try {
    const updatedTitle = `API integration updated ${Date.now()}`;
    const updated = await owner.patch(`/api/bookings/${bookingId}`, {
      data: {
        title: updatedTitle,
        startsAt: created.startsAt.toISOString(),
        endsAt: created.endsAt.toISOString(),
        participationMode: "INVITE_ONLY",
        participantIds: [],
      },
    });
    expect(updated.ok()).toBe(true);

    const mine = await owner.get("/api/bookings/mine?scope=future&page=1");
    expect(mine.ok()).toBe(true);
    const body = (await mine.json()) as {
      bookings: Array<{ id: string; title: string }>;
    };
    expect(body.bookings).toContainEqual(
      expect.objectContaining({ id: bookingId, title: updatedTitle }),
    );
  } finally {
    const cancelled = await cancelBooking(owner, bookingId);
    expect(cancelled.ok()).toBe(true);
  }
});

test("allows only one concurrent booking and protects ownership", async () => {
  for (const startsAt of bookingCandidates(4)) {
    const endsAt = new Date(startsAt.getTime() + 30 * 60_000);
    const responses = await Promise.all([
      createBooking(
        owner,
        startsAt,
        endsAt,
        `API concurrency owner ${Date.now()}`,
      ),
      createBooking(
        colleague,
        startsAt,
        endsAt,
        `API concurrency colleague ${Date.now()}`,
      ),
    ]);
    const successfulIndex = responses.findIndex(
      (response) => response.status() === 201,
    );
    const conflictIndex = responses.findIndex(
      (response) => response.status() === 409,
    );
    if (successfulIndex < 0 && conflictIndex >= 0) continue;

    expect(successfulIndex).toBeGreaterThanOrEqual(0);
    expect(conflictIndex).toBeGreaterThanOrEqual(0);
    await expectApiError(responses[conflictIndex], "SLOT_TAKEN");

    const winner = (await responses[successfulIndex].json()) as {
      id: string;
    };
    const winnerContext = successfulIndex === 0 ? owner : colleague;
    const otherContext = successfulIndex === 0 ? colleague : owner;
    try {
      const forbidden = await cancelBooking(otherContext, winner.id);
      expect(forbidden.status()).toBe(403);
      await expectApiError(forbidden, "NOT_BOOKING_OWNER");
    } finally {
      const cleanup = await cancelBooking(winnerContext, winner.id);
      expect(cleanup.ok()).toBe(true);
    }
    return;
  }

  throw new Error("No available slot found for concurrency integration test");
});

async function authenticatedContext(
  email: string,
  password: string,
): Promise<APIRequestContext> {
  const context = await request.newContext({ baseURL });
  const response = await context.post("/api/auth/login", {
    data: { email, password },
  });
  expect(response.ok()).toBe(true);
  return context;
}

async function createInAvailableSlot(
  context: APIRequestContext,
  title: string,
) {
  for (const startsAt of bookingCandidates(2)) {
    const endsAt = new Date(startsAt.getTime() + 30 * 60_000);
    const response = await createBooking(
      context,
      startsAt,
      endsAt,
      `${title} ${Date.now()}`,
    );
    if (response.status() === 409) continue;
    expect(response.status()).toBe(201);
    return {
      body: (await response.json()) as { id: string },
      startsAt,
      endsAt,
    };
  }
  throw new Error("No available slot found for booking integration test");
}

function createBooking(
  context: APIRequestContext,
  startsAt: Date,
  endsAt: Date,
  title: string,
): Promise<APIResponse> {
  return context.post("/api/bookings", {
    data: {
      roomId,
      title,
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      participationMode: "INVITE_ONLY",
      participantIds: [],
    },
  });
}

function cancelBooking(
  context: APIRequestContext,
  bookingId: string,
): Promise<APIResponse> {
  return context.delete(`/api/bookings/${bookingId}`, {
    data: { reason: "API integration cleanup" },
  });
}

async function expectApiError(
  response: APIResponse,
  code: string,
): Promise<void> {
  const body = (await response.json()) as { error?: { code?: string } };
  expect(body.error?.code).toBe(code);
}

function bookingCandidates(count: number): Date[] {
  const result: Date[] = [];
  let localDate = toZonedTime(new Date(), officeTimeZone);
  while (result.length < count) {
    localDate = addDays(localDate, 1);
    const weekday = localDate.getDay();
    if (weekday === 0 || weekday === 6) continue;
    result.push(
      fromZonedTime(
        set(localDate, {
          hours: 16,
          minutes: 0,
          seconds: 0,
          milliseconds: 0,
        }),
        officeTimeZone,
      ),
    );
  }
  return result;
}
