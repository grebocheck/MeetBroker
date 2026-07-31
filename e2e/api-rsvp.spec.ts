import {
  expect,
  request,
  test,
  type APIRequestContext,
  type APIResponse,
} from "@playwright/test";
import { addDays, set } from "date-fns";
import { fromZonedTime, toZonedTime } from "date-fns-tz";
import { demoCredentials } from "./demo-credentials";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:8080";
const officeTimeZone = "Europe/Kyiv";
const participantId = "00000000-0000-4000-8000-000000000002";

let organizer: APIRequestContext;
let participant: APIRequestContext;
let roomId: string;

test.beforeAll(async () => {
  [organizer, participant] = await Promise.all([
    authenticatedContext(
      demoCredentials.admin.email,
      demoCredentials.admin.password,
    ),
    authenticatedContext(
      demoCredentials.user.email,
      demoCredentials.user.password,
    ),
  ]);
  const response = await organizer.get("/api/rooms");
  expect(response.ok()).toBe(true);
  const body = (await response.json()) as { rooms: Array<{ id: string }> };
  roomId = body.rooms[0]?.id ?? "";
  expect(roomId).not.toBe("");
});

test.afterAll(async () => {
  await Promise.all([organizer.dispose(), participant.dispose()]);
});

for (const status of ["ACCEPTED", "DECLINED"] as const) {
  test(`records a ${status.toLowerCase()} invitation exactly once`, async () => {
    const booking = await createInvitation(
      `RSVP ${status.toLowerCase()} ${Date.now()}`,
    );

    try {
      const response = await participant.post(
        `/api/bookings/${booking.id}/respond`,
        { data: { status } },
      );
      expect(response.status()).toBe(204);

      const repeated = await participant.post(
        `/api/bookings/${booking.id}/respond`,
        { data: { status } },
      );
      expect(repeated.status()).toBe(404);
      await expectApiError(repeated, "INVITATION_NOT_FOUND");

      const calendar = await participant.get(
        `/api/bookings/my-calendar?from=${encodeURIComponent(
          booking.startsAt.toISOString(),
        )}&to=${encodeURIComponent(booking.endsAt.toISOString())}`,
      );
      expect(calendar.ok()).toBe(true);
      const calendarBody = (await calendar.json()) as {
        meetings: Array<{ id: string; participantStatus?: string }>;
      };
      if (status === "ACCEPTED") {
        expect(calendarBody.meetings).toContainEqual(
          expect.objectContaining({
            id: booking.id,
            participantStatus: status,
          }),
        );
      } else {
        expect(calendarBody.meetings).not.toContainEqual(
          expect.objectContaining({ id: booking.id }),
        );
      }
    } finally {
      const cleanup = await organizer.delete(`/api/bookings/${booking.id}`, {
        data: { reason: "RSVP integration cleanup" },
      });
      expect(cleanup.ok()).toBe(true);
    }
  });
}

async function createInvitation(title: string) {
  for (const startsAt of bookingCandidates(8)) {
    const endsAt = new Date(startsAt.getTime() + 30 * 60_000);
    const response = await organizer.post("/api/bookings", {
      data: {
        roomId,
        title,
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        participationMode: "INVITE_ONLY",
        participantIds: [participantId],
      },
    });
    if (response.status() === 409) continue;
    expect(response.status()).toBe(201);
    const body = (await response.json()) as { id: string };
    return { id: body.id, startsAt, endsAt };
  }
  throw new Error("No available slot found for RSVP integration test");
}

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
    for (const hour of [13, 14, 15, 16]) {
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
      if (result.length === count) return result;
    }
  }
  return result;
}
