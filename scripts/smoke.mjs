const baseUrl = (process.env.BASE_URL ?? "http://localhost:8080").replace(
  /\/$/,
  "",
);
const userCredentials = {
  email: process.env.SMOKE_USER_EMAIL ?? "user@meetbroker.local",
  password: process.env.SMOKE_USER_PASSWORD ?? "User12345!",
};
const adminCredentials = {
  email: process.env.SMOKE_ADMIN_EMAIL ?? "admin@meetbroker.local",
  password: process.env.SMOKE_ADMIN_PASSWORD ?? "Admin123!",
};
const securityCredentials = {
  email: "anna@meetbroker.local",
  password: "User12345!",
};

function check(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { "content-type": "application/json" } : {}),
      ...options.headers,
    },
  });
  const raw = await response.text();
  let body;

  if (raw) {
    try {
      body = JSON.parse(raw);
    } catch {
      body = raw;
    }
  }

  if (!response.ok) {
    const details =
      typeof body === "string" ? body : JSON.stringify(body, null, 2);
    throw new Error(
      `${options.method ?? "GET"} ${path} returned ${response.status}: ${details}`,
    );
  }

  return { response, body };
}

async function waitForReady(timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const health = await request("/api/health");
      if (health.body?.status === "ok") return;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw lastError ?? new Error("Application did not become ready");
}

async function login(credentials) {
  const { response, body } = await request("/api/auth/login", {
    method: "POST",
    body: JSON.stringify(credentials),
  });
  const setCookie =
    response.headers.getSetCookie?.()[0] ?? response.headers.get("set-cookie");
  check(
    setCookie,
    `Login for ${credentials.email} did not set a session cookie`,
  );
  check(body?.user?.email === credentials.email, "Login returned another user");
  return setCookie.split(";", 1)[0];
}

function localParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  return Object.fromEntries(
    parts
      .filter(({ type }) => type !== "literal")
      .map(({ type, value }) => [type, value]),
  );
}

function bookingCandidates(timeZone) {
  const candidates = [];
  const first = new Date();
  first.setUTCMinutes(first.getUTCMinutes() < 30 ? 30 : 60, 0, 0);
  first.setUTCDate(first.getUTCDate() + 2);

  for (let offset = 0; offset < 24 * 30 * 2; offset += 1) {
    const instant = new Date(first.getTime() + offset * 30 * 60_000);
    const parts = localParts(instant, timeZone);
    if (
      parts.hour === "12" &&
      parts.minute === "00" &&
      !["Sat", "Sun"].includes(parts.weekday)
    ) {
      candidates.push(instant);
    }
  }

  return candidates;
}

function dateKey(date, timeZone) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

async function verifyRoomAvailabilityRules(adminCookie, room) {
  const changedWorkStart = room.workStart === "08:30" ? "09:00" : "08:30";
  const changedWorkEnd = room.workEnd === "18:30" ? "19:00" : "18:30";
  await request(`/api/admin/rooms/${room.id}`, {
    method: "PATCH",
    headers: { cookie: adminCookie },
    body: JSON.stringify({
      workStart: changedWorkStart,
      workEnd: changedWorkEnd,
    }),
  });
  const changedRooms = await request("/api/rooms", {
    headers: { cookie: adminCookie },
  });
  const changedRoom = changedRooms.body.rooms.find(
    (candidate) => candidate.id === room.id,
  );
  check(
    changedRoom?.workStart === changedWorkStart &&
      changedRoom?.workEnd === changedWorkEnd,
    "Room working hours were not updated",
  );

  const officeTimeZone = process.env.OFFICE_TIME_ZONE ?? "Europe/Kyiv";
  const startsAt = bookingCandidates(officeTimeZone)[0];
  const endsAt = new Date(startsAt.getTime() + 30 * 60_000);
  const recurrenceUntil = new Date(startsAt.getTime() + 6 * 24 * 60 * 60_000);
  const created = await request("/api/admin/room-blocks", {
    method: "POST",
    headers: { cookie: adminCookie },
    body: JSON.stringify({
      roomId: room.id,
      title: `Recurring smoke ${Date.now()}`,
      privateNote: "Automated lifecycle verification",
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      recurrence: "DAILY",
      recurrenceInterval: 2,
      recurrenceUntil: dateKey(recurrenceUntil, officeTimeZone),
    }),
  });
  check(
    created.body?.id && created.body?.occurrenceCount === 4,
    "Recurring room unavailability did not materialize four occurrences",
  );
  const blockRules = await request("/api/admin/room-blocks", {
    headers: { cookie: adminCookie },
  });
  check(
    blockRules.body?.blocks?.some(
      (block) =>
        block.id === created.body.id &&
        block.kind === "SERIES" &&
        block.occurrenceCount === 4,
    ),
    "Recurring room unavailability is missing from administration",
  );
  const rangeFrom = new Date(startsAt.getTime() - 60 * 60_000);
  const rangeTo = new Date(recurrenceUntil.getTime() + 24 * 60 * 60_000);
  const schedule = await request(
    `/api/bookings/schedule?roomId=${room.id}` +
      `&from=${encodeURIComponent(rangeFrom.toISOString())}` +
      `&to=${encodeURIComponent(rangeTo.toISOString())}`,
    { headers: { cookie: adminCookie } },
  );
  check(
    schedule.body?.blocks?.filter((block) => block.seriesId === created.body.id)
      .length === 4,
    "Recurring room unavailability is not fully visible in the schedule",
  );
  await request(`/api/admin/room-blocks/${created.body.id}?scope=series`, {
    method: "DELETE",
    headers: { cookie: adminCookie },
  });
  const scheduleAfterCancellation = await request(
    `/api/bookings/schedule?roomId=${room.id}` +
      `&from=${encodeURIComponent(rangeFrom.toISOString())}` +
      `&to=${encodeURIComponent(rangeTo.toISOString())}`,
    { headers: { cookie: adminCookie } },
  );
  check(
    !scheduleAfterCancellation.body?.blocks?.some(
      (block) => block.seriesId === created.body.id,
    ),
    "Cancelled room unavailability series remains in the schedule",
  );

  await request(`/api/admin/rooms/${room.id}`, {
    method: "PATCH",
    headers: { cookie: adminCookie },
    body: JSON.stringify({
      workStart: room.workStart,
      workEnd: room.workEnd,
    }),
  });
  return created.body.id;
}

async function verifyAccountCredentials() {
  const cookie = await login(securityCredentials);
  const temporaryEmail = `anna.smoke.${Date.now()}@meetbroker.local`;
  const unauthorizedEmailChange = await fetch(
    `${baseUrl}/api/users/me/email-change`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie,
      },
      body: JSON.stringify({
        email: temporaryEmail,
        currentPassword: "incorrect-password",
      }),
    },
  );
  const unauthorizedBody = await unauthorizedEmailChange.json();
  check(
    unauthorizedEmailChange.status === 401 &&
      unauthorizedBody?.error?.code === "CURRENT_PASSWORD_INCORRECT",
    "Email change must require the current password",
  );
  const emailChange = await request("/api/users/me/email-change", {
    method: "POST",
    headers: { cookie },
    body: JSON.stringify({
      email: temporaryEmail,
      currentPassword: securityCredentials.password,
    }),
  });
  check(
    emailChange.body?.pendingEmail === temporaryEmail &&
      emailChange.body?.verificationToken,
    "Email change did not create a pending verified address",
  );
  await request("/api/auth/verify-email", {
    method: "POST",
    body: JSON.stringify({ token: emailChange.body.verificationToken }),
  });
  const changedAccount = await request("/api/auth/me", {
    headers: { cookie },
  });
  check(
    changedAccount.body?.user?.email === temporaryEmail &&
      changedAccount.body?.user?.pendingEmail === null,
    "Verified email change was not applied to the active account",
  );

  const restoreEmail = await request("/api/users/me/email-change", {
    method: "POST",
    headers: { cookie },
    body: JSON.stringify({
      email: securityCredentials.email,
      currentPassword: securityCredentials.password,
    }),
  });
  await request("/api/auth/verify-email", {
    method: "POST",
    body: JSON.stringify({ token: restoreEmail.body.verificationToken }),
  });

  const temporaryPassword = `Smoke${Date.now()}!`;
  await request("/api/users/me/password-change", {
    method: "POST",
    headers: { cookie },
    body: JSON.stringify({
      currentPassword: securityCredentials.password,
      newPassword: temporaryPassword,
    }),
  });
  await request("/api/users/me/password-change", {
    method: "POST",
    headers: { cookie },
    body: JSON.stringify({
      currentPassword: temporaryPassword,
      newPassword: securityCredentials.password,
    }),
  });
  check(
    await login(securityCredentials),
    "Restored password cannot create a new session",
  );
}

async function createUpdateAndCancelBooking(
  cookie,
  notificationRecipientCookie,
  notificationRecipientId,
  room,
) {
  for (const startsAt of bookingCandidates(
    process.env.OFFICE_TIME_ZONE ?? "Europe/Kyiv",
  )) {
    const endsAt = new Date(startsAt.getTime() + 30 * 60_000);
    const response = await fetch(`${baseUrl}/api/bookings`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie,
      },
      body: JSON.stringify({
        roomId: room.id,
        title: `MVP smoke ${Date.now()}`,
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        participationMode: "INVITE_ONLY",
        participantIds: [notificationRecipientId],
      }),
    });
    const body = await response.json();

    if (response.status === 409) {
      continue;
    }
    check(response.ok, `Booking creation failed: ${JSON.stringify(body)}`);
    check(body.id, "Booking creation did not return an id");

    const updatedTitle = `Updated MVP smoke ${Date.now()}`;
    await request(`/api/bookings/${body.id}`, {
      method: "PATCH",
      headers: { cookie },
      body: JSON.stringify({
        title: updatedTitle,
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        participationMode: "INVITE_ONLY",
        participantIds: [notificationRecipientId],
      }),
    });
    const recipientNotifications = await request("/api/notifications", {
      headers: { cookie: notificationRecipientCookie },
    });
    check(
      recipientNotifications.body?.notifications?.some(
        (notification) =>
          notification.bookingId === body.id &&
          notification.type === "BOOKING_UPDATED" &&
          notification.body.includes(updatedTitle),
      ),
      "Booking update notification was not created",
    );

    const administrativeTitle = `Admin adjusted MVP smoke ${Date.now()}`;
    const administrativeReason = "Room operations verification";
    const missingReason = await fetch(`${baseUrl}/api/bookings/${body.id}`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        cookie: notificationRecipientCookie,
      },
      body: JSON.stringify({
        title: administrativeTitle,
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        participationMode: "INVITE_ONLY",
        participantIds: [notificationRecipientId],
      }),
    });
    const missingReasonBody = await missingReason.json();
    check(
      missingReason.status === 400 &&
        missingReasonBody?.error?.code === "ADMIN_EDIT_REASON_REQUIRED",
      "Editing another user's booking must require an administrative reason",
    );
    await request(`/api/bookings/${body.id}`, {
      method: "PATCH",
      headers: { cookie: notificationRecipientCookie },
      body: JSON.stringify({
        title: administrativeTitle,
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        participationMode: "INVITE_ONLY",
        participantIds: [notificationRecipientId],
        adminReason: administrativeReason,
      }),
    });
    const organizerNotifications = await request("/api/notifications", {
      headers: { cookie },
    });
    check(
      organizerNotifications.body?.notifications?.some(
        (notification) =>
          notification.bookingId === body.id &&
          notification.type === "BOOKING_UPDATED" &&
          notification.body.includes("Адміністратор") &&
          notification.body.includes(administrativeReason),
      ),
      "Administrative update was not attributed in organizer notification",
    );

    await request(`/api/bookings/${body.id}`, {
      method: "DELETE",
      headers: { cookie: notificationRecipientCookie },
      body: JSON.stringify({ reason: "Administrative smoke cancellation" }),
    });
    return { id: body.id, startsAt };
  }

  throw new Error("Could not find an available weekday smoke-test slot");
}

async function main() {
  console.log(`Smoke checking ${baseUrl}`);
  await waitForReady();

  const home = await request("/");
  check(
    typeof home.body === "string" && home.body.includes('<div id="root">'),
    "Frontend entry page is missing",
  );

  const userCookie = await login(userCredentials);
  const adminCookie = await login(adminCredentials);
  const adminMe = await request("/api/auth/me", {
    headers: { cookie: adminCookie },
  });
  const roomsResult = await request("/api/rooms", {
    headers: { cookie: userCookie },
  });
  check(
    roomsResult.body?.rooms?.length >= 2,
    "Expected at least two seeded rooms",
  );

  const colleagues = await request("/api/users/colleagues", {
    headers: { cookie: userCookie },
  });
  check(
    Array.isArray(colleagues.body?.users),
    "Colleagues response must contain a resolved users array",
  );

  const booking = await createUpdateAndCancelBooking(
    userCookie,
    adminCookie,
    adminMe.body.user.id,
    roomsResult.body.rooms[1],
  );

  const openEvents = await request("/api/bookings/open", {
    headers: { cookie: userCookie },
  });
  check(
    Array.isArray(openEvents.body?.events),
    "Open events response is invalid",
  );

  const preferences = await request("/api/notifications/preferences", {
    headers: { cookie: userCookie },
  });
  check(
    Array.isArray(preferences.body?.subscriptions) &&
      preferences.body.subscriptions.length === 12,
    "Notification preferences response is invalid",
  );
  const invitationsByEmail = preferences.body.subscriptions.find(
    (item) => item.category === "INVITATIONS" && item.channel === "EMAIL",
  );
  const updatedPreferences = await request("/api/notifications/preferences", {
    method: "PATCH",
    headers: { cookie: userCookie },
    body: JSON.stringify({
      category: "INVITATIONS",
      channel: "EMAIL",
      enabled: !invitationsByEmail.enabled,
    }),
  });
  check(
    updatedPreferences.body?.subscriptions?.some(
      (item) =>
        item.category === "INVITATIONS" &&
        item.channel === "EMAIL" &&
        item.enabled === !invitationsByEmail.enabled,
    ),
    "Notification preference matrix update failed",
  );
  await request("/api/notifications/preferences", {
    method: "PATCH",
    headers: { cookie: userCookie },
    body: JSON.stringify({
      category: "INVITATIONS",
      channel: "EMAIL",
      enabled: invitationsByEmail.enabled,
    }),
  });

  const users = await request("/api/admin/users", {
    headers: { cookie: adminCookie },
  });
  check(
    users.body?.users?.length >= 3,
    "Expected seeded users in admin response",
  );

  const managedBookings = await request(
    "/api/admin/bookings?status=cancelled&search=Admin%20adjusted%20MVP%20smoke",
    { headers: { cookie: adminCookie } },
  );
  const managedBooking = managedBookings.body?.bookings?.find(
    (item) => item.id === booking.id,
  );
  check(managedBooking, "Cancelled booking is missing from admin management");
  check(
    managedBooking.room?.id && managedBooking.organizer?.email,
    "Admin booking details are incomplete",
  );
  check(
    Array.isArray(managedBooking.participants),
    "Admin booking participants must be resolved",
  );
  check(
    managedBooking.cancellationReason === "Administrative smoke cancellation",
    "Admin cancellation reason is missing from booking details",
  );

  const roomBlockSeriesId = await verifyRoomAvailabilityRules(
    adminCookie,
    roomsResult.body.rooms[0],
  );
  await verifyAccountCredentials();

  const placeholderRoom = roomsResult.body.rooms.find(
    (room) => room.imageUrl === null,
  );
  check(placeholderRoom, "Expected one demo room to keep the placeholder");
  const roomImageForm = new FormData();
  roomImageForm.set(
    "image",
    new Blob(
      [
        '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="18">' +
          '<rect width="32" height="18" fill="#0878f9"/></svg>',
      ],
      { type: "image/svg+xml" },
    ),
    "smoke-room.svg",
  );
  const imageUpload = await fetch(
    `${baseUrl}/api/admin/rooms/${placeholderRoom.id}/image`,
    {
      method: "POST",
      headers: { cookie: adminCookie },
      body: roomImageForm,
    },
  );
  const imageUploadBody = await imageUpload.json();
  check(
    imageUpload.ok && imageUploadBody?.imageUrl?.endsWith(".webp"),
    `Room image upload failed: ${JSON.stringify(imageUploadBody)}`,
  );
  const roomsWithImage = await request("/api/rooms", {
    headers: { cookie: adminCookie },
  });
  check(
    roomsWithImage.body.rooms.find((room) => room.id === placeholderRoom.id)
      ?.imageUrl === imageUploadBody.imageUrl,
    "Uploaded room image was not returned by the rooms API",
  );
  await request(`/api/admin/rooms/${placeholderRoom.id}/image`, {
    method: "DELETE",
    headers: { cookie: adminCookie },
  });
  const roomsWithoutImage = await request("/api/rooms", {
    headers: { cookie: adminCookie },
  });
  check(
    roomsWithoutImage.body.rooms.find((room) => room.id === placeholderRoom.id)
      ?.imageUrl === null,
    "Room image removal did not restore the placeholder state",
  );

  const audit = await request(
    "/api/admin/audit?category=booking&search=Admin%20adjusted",
    { headers: { cookie: adminCookie } },
  );
  check(Array.isArray(audit.body?.logs), "Admin audit response is invalid");
  check(
    audit.body.logs.every((entry) => entry.targetType === "BOOKING"),
    "Event log category filter returned a non-booking event",
  );
  check(
    audit.body.logs.some(
      (entry) =>
        entry.targetId === booking.id &&
        entry.action === "BOOKING_UPDATED_BY_ADMIN" &&
        entry.details?.reason === "Room operations verification",
    ),
    "Administrative booking update is missing from event log",
  );
  const roomAudit = await request(
    "/api/admin/audit?category=room&search=Recurring%20smoke",
    { headers: { cookie: adminCookie } },
  );
  check(
    roomAudit.body?.logs?.some(
      (entry) =>
        entry.targetId === roomBlockSeriesId &&
        entry.action === "ROOM_BLOCK_SERIES_CANCELLED",
    ),
    "Room unavailability series lifecycle is missing from the event log",
  );

  console.log(
    `Smoke passed: UI, health, auth, rooms, booking ${booking.id} create/update/cancel, ` +
      "colleagues, events, preferences, booking management, room image lifecycle " +
      "working hours, recurring unavailability, account credentials and administration",
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
