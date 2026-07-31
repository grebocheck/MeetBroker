import { expect, test, type APIResponse, type Page } from "@playwright/test";
import { addDays, format } from "date-fns";
import { fromZonedTime } from "date-fns-tz";

const officeTimeZone = "Europe/Kyiv";

test("an invitation can be accepted from the meeting details modal", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("meetbroker.locale", "uk");
  });
  await login(page, "admin@meetbroker.local", "Admin123!");

  const colleaguesResponse = await page.request.get("/api/users/colleagues");
  expect(colleaguesResponse.ok()).toBe(true);
  const colleagues = (await colleaguesResponse.json()) as {
    users: { id: string }[];
  };
  const participant = colleagues.users.find(
    (user) => user.id === "00000000-0000-4000-8000-000000000002",
  );
  expect(participant).toBeTruthy();

  const roomsResponse = await page.request.get("/api/rooms");
  expect(roomsResponse.ok()).toBe(true);
  const rooms = (await roomsResponse.json()) as {
    rooms: { id: string; workingDays: number[] }[];
  };
  const room = rooms.rooms[0];
  expect(room).toBeTruthy();

  const title = `Invitation flow ${Date.now()}`;
  const booking = await createAvailableBooking(
    page,
    room.id,
    room.workingDays,
    participant!.id,
    title,
  );

  try {
    await login(page, "user@meetbroker.local", "User12345!");
    await page.goto("/my-calendar");
    await page.getByRole("button", { name: new RegExp(title) }).click();

    const dialog = page.getByRole("dialog");
    const accept = dialog.getByRole("button", {
      name: "Прийняти",
      exact: true,
    });
    await expect(accept).toBeVisible();

    const response = page.waitForResponse(
      (item) =>
        item.url().endsWith(`/api/bookings/${booking.id}/respond`) &&
        item.request().method() === "POST",
    );
    await accept.click();
    expect((await response).ok()).toBe(true);
    await expect(accept).toHaveCount(0);
  } finally {
    await login(page, "admin@meetbroker.local", "Admin123!");
    const cleanup = await page.request.delete(`/api/bookings/${booking.id}`, {
      data: { reason: "Invitation acceptance test cleanup" },
    });
    expect(cleanup.ok()).toBe(true);
  }
});

async function login(page: Page, email: string, password: string) {
  const response = await page.request.post("/api/auth/login", {
    data: { email, password },
  });
  expect(response.ok()).toBe(true);
}

async function createAvailableBooking(
  page: Page,
  roomId: string,
  workingDays: number[],
  participantId: string,
  title: string,
): Promise<{ id: string }> {
  for (let offset = 1; offset <= 6; offset += 1) {
    const date = addDays(new Date(), offset);
    const weekday = date.getDay() === 0 ? 7 : date.getDay();
    if (!workingDays.includes(weekday)) continue;
    for (const hour of [14, 15, 16]) {
      const startsAt = fromZonedTime(
        `${format(date, "yyyy-MM-dd")}T${String(hour).padStart(2, "0")}:00`,
        officeTimeZone,
      );
      const endsAt = new Date(startsAt.getTime() + 30 * 60_000);
      const response: APIResponse = await page.request.post("/api/bookings", {
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
      return (await response.json()) as { id: string };
    }
  }
  throw new Error("No available slot found for invitation acceptance test");
}
