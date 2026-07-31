import {
  expect,
  request,
  test,
  type APIRequestContext,
  type APIResponse,
} from "@playwright/test";
import { addDays, set } from "date-fns";
import { fromZonedTime, toZonedTime } from "date-fns-tz";
import { readFileSync } from "node:fs";
import { demoCredentials } from "./demo-credentials";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:8080";
const officeTimeZone = "Europe/Kyiv";
const maxUploadBytes = 12 * 1024 * 1024;
const validImage = readFileSync("apps/web/public/rooms/mars.webp");

let admin: APIRequestContext;
let owner: APIRequestContext;
let colleague: APIRequestContext;
let roomId: string;

test.beforeAll(async () => {
  [admin, owner, colleague] = await Promise.all([
    authenticatedContext(
      demoCredentials.admin.email,
      demoCredentials.admin.password,
    ),
    authenticatedContext(
      demoCredentials.user.email,
      demoCredentials.user.password,
    ),
    authenticatedContext(
      demoCredentials.colleague.email,
      demoCredentials.colleague.password,
    ),
  ]);
  const response = await owner.get("/api/rooms");
  expect(response.ok()).toBe(true);
  const body = (await response.json()) as {
    rooms: Array<{ id: string; imageUrl: string | null }>;
  };
  roomId = body.rooms.find(({ imageUrl }) => !imageUrl)?.id ?? "";
  expect(roomId, "demo data must retain one placeholder room").not.toBe("");
});

test.afterAll(async () => {
  await Promise.all([admin.dispose(), owner.dispose(), colleague.dispose()]);
});

test("validates, optimizes and replaces a custom avatar with a preset", async () => {
  const currentResponse = await owner.get("/api/auth/me");
  expect(currentResponse.ok()).toBe(true);
  const current = (await currentResponse.json()) as {
    user: { avatarPreset: string; avatarUrl: string | null };
  };
  expect(current.user.avatarUrl).toBeNull();

  const invalid = await owner.post("/api/users/me/avatar", {
    multipart: {
      avatar: {
        name: "not-an-image.txt",
        mimeType: "text/plain",
        buffer: Buffer.from("not an image"),
      },
    },
  });
  expect(invalid.status()).toBe(400);
  await expectApiError(invalid, "INVALID_IMAGE");

  const uploaded = await owner.post("/api/users/me/avatar", {
    multipart: {
      avatar: {
        name: "avatar.webp",
        mimeType: "image/webp",
        buffer: validImage,
      },
    },
  });
  expect(uploaded.status()).toBe(201);
  const uploadedBody = (await uploaded.json()) as { avatarUrl: string };
  expect(uploadedBody.avatarUrl).toMatch(/^\/uploads\/.+\.webp$/);

  const image = await owner.get(uploadedBody.avatarUrl);
  expect(image.ok()).toBe(true);
  expect(image.headers()["content-type"]).toContain("image/webp");

  const reset = await owner.patch("/api/users/me", {
    data: { avatarPreset: current.user.avatarPreset },
  });
  expect(reset.ok()).toBe(true);
  const resetBody = (await reset.json()) as {
    user: { avatarPreset: string; avatarUrl: string | null };
  };
  expect(resetBody.user).toMatchObject({
    avatarPreset: current.user.avatarPreset,
    avatarUrl: null,
  });
  expect((await owner.get(uploadedBody.avatarUrl)).status()).toBe(404);
});

test("rejects a multipart image above the shared upload policy", async () => {
  const response = await owner.post("/api/users/me/avatar", {
    multipart: {
      avatar: {
        name: "too-large.webp",
        mimeType: "image/webp",
        buffer: Buffer.alloc(maxUploadBytes + 1),
      },
    },
  });

  expect(response.status()).toBe(413);
  await expectApiError(response, "PAYLOAD_TOO_LARGE");
});

test("enforces booking-image ownership and supports explicit cleanup", async () => {
  const booking = await createBooking();

  try {
    const forbidden = await colleague.post(
      `/api/bookings/${booking.id}/image`,
      {
        multipart: {
          image: {
            name: "booking.webp",
            mimeType: "image/webp",
            buffer: validImage,
          },
        },
      },
    );
    expect(forbidden.status()).toBe(403);
    await expectApiError(forbidden, "NOT_BOOKING_OWNER");

    const uploaded = await owner.post(`/api/bookings/${booking.id}/image`, {
      multipart: {
        image: {
          name: "booking.webp",
          mimeType: "image/webp",
          buffer: validImage,
        },
      },
    });
    expect(uploaded.status()).toBe(201);
    const uploadedBody = (await uploaded.json()) as { imageUrl: string };
    expect(uploadedBody.imageUrl).toMatch(/^\/uploads\/.+\.webp$/);

    const removed = await owner.delete(`/api/bookings/${booking.id}/image`);
    expect(removed.status()).toBe(204);
    expect((await owner.get(uploadedBody.imageUrl)).status()).toBe(404);
  } finally {
    const cleanup = await owner.delete(`/api/bookings/${booking.id}`, {
      data: { reason: "Upload integration cleanup" },
    });
    expect(cleanup.ok()).toBe(true);
  }
});

test("lets only administrators manage room images", async () => {
  const forbidden = await owner.post(`/api/admin/rooms/${roomId}/image`, {
    multipart: {
      image: {
        name: "room.webp",
        mimeType: "image/webp",
        buffer: validImage,
      },
    },
  });
  expect(forbidden.status()).toBe(403);

  const uploaded = await admin.post(`/api/admin/rooms/${roomId}/image`, {
    multipart: {
      image: {
        name: "room.webp",
        mimeType: "image/webp",
        buffer: validImage,
      },
    },
  });
  expect(uploaded.status()).toBe(201);
  const uploadedBody = (await uploaded.json()) as { imageUrl: string };
  expect(uploadedBody.imageUrl).toMatch(/^\/uploads\/.+\.webp$/);

  const removed = await admin.delete(`/api/admin/rooms/${roomId}/image`);
  expect(removed.status()).toBe(204);
  expect((await admin.get(uploadedBody.imageUrl)).status()).toBe(404);
});

async function createBooking() {
  for (const startsAt of bookingCandidates()) {
    const endsAt = new Date(startsAt.getTime() + 30 * 60_000);
    const response = await owner.post("/api/bookings", {
      data: {
        roomId,
        title: `Upload integration ${Date.now()}`,
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        participationMode: "INVITE_ONLY",
        participantIds: [],
      },
    });
    if (response.status() === 409) continue;
    expect(response.status()).toBe(201);
    return (await response.json()) as { id: string };
  }
  throw new Error("No available slot found for upload integration test");
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

function bookingCandidates(): Date[] {
  const result: Date[] = [];
  let localDate = toZonedTime(new Date(), officeTimeZone);
  while (result.length < 8) {
    localDate = addDays(localDate, 1);
    const weekday = localDate.getDay();
    if (weekday === 0 || weekday === 6) continue;
    for (const hour of [13, 14, 15, 16]) {
      result.push(
        fromZonedTime(
          set(localDate, {
            hours: hour,
            minutes: 30,
            seconds: 0,
            milliseconds: 0,
          }),
          officeTimeZone,
        ),
      );
    }
  }
  return result;
}
