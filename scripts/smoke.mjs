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
  const changedWorkingDays =
    room.workingDays.length === 4 ? [1, 2, 3, 4, 5] : [1, 2, 3, 4];
  await request(`/api/admin/rooms/${room.id}`, {
    method: "PATCH",
    headers: { cookie: adminCookie },
    body: JSON.stringify({
      workStart: changedWorkStart,
      workEnd: changedWorkEnd,
      workingDays: changedWorkingDays,
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
      changedRoom?.workEnd === changedWorkEnd &&
      JSON.stringify(changedRoom?.workingDays) ===
        JSON.stringify(changedWorkingDays),
    "Room working availability was not updated",
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
  const scheduleSeries = schedule.body?.blocks?.filter(
    (block) => block.seriesId === created.body.id,
  );
  check(
    scheduleSeries?.length === 4,
    "Recurring room unavailability is not fully visible in the schedule",
  );
  check(
    scheduleSeries.every(
      (block) =>
        block.recurrence === "DAILY" &&
        block.recurrenceInterval === 2 &&
        block.recurrenceUntil === dateKey(recurrenceUntil, officeTimeZone) &&
        !Object.hasOwn(block, "privateNote"),
    ),
    "Public schedule does not expose safe recurrence details",
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
      workingDays: room.workingDays,
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
    emailChange.body?.verificationRequired
      ? emailChange.body?.pendingEmail === temporaryEmail &&
          emailChange.body?.email === securityCredentials.email
      : emailChange.body?.pendingEmail === null &&
          emailChange.body?.email === temporaryEmail,
    "Email change did not follow the configured verification policy",
  );
  const changedAccount = await request("/api/auth/me", {
    headers: { cookie },
  });
  check(
    emailChange.body.verificationRequired
      ? changedAccount.body?.user?.email === securityCredentials.email &&
          changedAccount.body?.user?.pendingEmail === temporaryEmail
      : changedAccount.body?.user?.email === temporaryEmail &&
          changedAccount.body?.user?.pendingEmail === null,
    "Email change state does not match the configured verification policy",
  );

  if (!emailChange.body.verificationRequired) {
    const restoreEmail = await request("/api/users/me/email-change", {
      method: "POST",
      headers: { cookie },
      body: JSON.stringify({
        email: securityCredentials.email,
        currentPassword: securityCredentials.password,
      }),
    });
    check(
      restoreEmail.body?.email === securityCredentials.email &&
        restoreEmail.body?.pendingEmail === null,
      "Immediate email change could not restore the demo account",
    );
  }

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
    return { id: body.id, startsAt, title: administrativeTitle };
  }

  throw new Error("Could not find an available weekday smoke-test slot");
}

async function verifyCriticalBookingGuards(ownerCookie, otherCookie, room) {
  const postBooking = (cookie, startsAt, endsAt, title) =>
    fetch(`${baseUrl}/api/bookings`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie,
      },
      body: JSON.stringify({
        roomId: room.id,
        title,
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
      }),
    });

  const pastStart = new Date(Date.now() - 24 * 60 * 60_000);
  pastStart.setUTCMinutes(0, 0, 0);
  const pastResponse = await postBooking(
    ownerCookie,
    pastStart,
    new Date(pastStart.getTime() + 30 * 60_000),
    "Past validation smoke",
  );
  const pastBody = await pastResponse.json();
  check(
    pastResponse.status === 400 && pastBody?.error?.code === "PAST",
    "Past booking must be rejected by the API",
  );

  for (const startsAt of bookingCandidates(
    process.env.OFFICE_TIME_ZONE ?? "Europe/Kyiv",
  )) {
    const outsideStart = new Date(startsAt.getTime() - 4 * 60 * 60_000);
    const outsideResponse = await postBooking(
      ownerCookie,
      outsideStart,
      new Date(outsideStart.getTime() + 30 * 60_000),
      "Working hours validation smoke",
    );
    const outsideBody = await outsideResponse.json();
    check(
      outsideResponse.status === 400 &&
        outsideBody?.error?.code === "OUTSIDE_WORKING_HOURS",
      "Booking outside working hours must be rejected by the API",
    );

    const endsAt = new Date(startsAt.getTime() + 30 * 60_000);
    const responses = await Promise.all([
      postBooking(
        ownerCookie,
        startsAt,
        endsAt,
        `Concurrent owner smoke ${Date.now()}`,
      ),
      postBooking(
        otherCookie,
        startsAt,
        endsAt,
        `Concurrent contender smoke ${Date.now()}`,
      ),
    ]);
    const results = await Promise.all(
      responses.map(async (response, index) => ({
        response,
        body: await response.json(),
        cookie: index === 0 ? ownerCookie : otherCookie,
      })),
    );
    const created = results.filter(({ response }) => response.status === 201);
    const conflicts = results.filter(({ response }) => response.status === 409);
    if (created.length === 0 && conflicts.length === 2) continue;

    if (created.length !== 1 || conflicts.length !== 1) {
      for (const result of created) {
        await fetch(`${baseUrl}/api/bookings/${result.body.id}`, {
          method: "DELETE",
          headers: {
            "content-type": "application/json",
            cookie: result.cookie,
          },
          body: JSON.stringify({ reason: "Concurrent smoke cleanup" }),
        });
      }
      throw new Error(
        `Concurrent booking expected one success and one conflict, received ${responses
          .map((response) => response.status)
          .join(", ")}`,
      );
    }
    check(
      conflicts[0].body?.error?.code === "SLOT_TAKEN",
      "Concurrent loser must receive SLOT_TAKEN",
    );

    const winner = created[0];
    const nonOwnerCookie =
      winner.cookie === ownerCookie ? otherCookie : ownerCookie;
    const forbidden = await fetch(`${baseUrl}/api/bookings/${winner.body.id}`, {
      method: "DELETE",
      headers: {
        "content-type": "application/json",
        cookie: nonOwnerCookie,
      },
      body: JSON.stringify({ reason: "Must not be allowed" }),
    });
    const forbiddenBody = await forbidden.json();
    check(
      forbidden.status === 403 &&
        forbiddenBody?.error?.code === "NOT_BOOKING_OWNER",
      "Another user must not be able to cancel a booking through the API",
    );

    await request(`/api/bookings/${winner.body.id}`, {
      method: "DELETE",
      headers: { cookie: winner.cookie },
      body: JSON.stringify({ reason: "Critical guard smoke cleanup" }),
    });
    return;
  }

  throw new Error("Could not find an available slot for booking guard smoke");
}

async function verifyCapabilityPolicies({
  adminCookie,
  userCookie,
  credentials,
  userId,
  room,
}) {
  const restrictions = [];
  const createRestriction = async (capability, reason, roomId) => {
    const created = await request(`/api/admin/users/${userId}/restrictions`, {
      method: "POST",
      headers: { cookie: adminCookie },
      body: JSON.stringify({
        capability,
        roomId,
        expiresAt: new Date(Date.now() + 60 * 60_000).toISOString(),
        reason,
      }),
    });
    check(created.body?.id, `${capability} restriction was not created`);
    restrictions.push(created.body.id);
    return created.body.id;
  };
  const removeRestriction = async (id) => {
    await request(`/api/admin/restrictions/${id}`, {
      method: "DELETE",
      headers: { cookie: adminCookie },
    });
    restrictions.splice(restrictions.indexOf(id), 1);
  };
  const expectRestricted = async (path, options, capability) => {
    const response = await fetch(`${baseUrl}${path}`, options);
    const body = await response.json();
    check(
      response.status === 403 &&
        body?.error?.code === "CAPABILITY_RESTRICTED" &&
        body?.error?.details?.capability === capability,
      `${capability} policy was not enforced: ${response.status} ${JSON.stringify(body)}`,
    );
  };

  try {
    let restrictionId = await createRestriction(
      "SCHEDULE_VIEW",
      "Scoped schedule smoke policy",
      room.id,
    );
    const from = new Date();
    const to = new Date(from.getTime() + 24 * 60 * 60_000);
    await expectRestricted(
      `/api/bookings/schedule?roomId=${room.id}` +
        `&from=${encodeURIComponent(from.toISOString())}` +
        `&to=${encodeURIComponent(to.toISOString())}`,
      { headers: { cookie: userCookie } },
      "SCHEDULE_VIEW",
    );
    const meWithPolicy = await request("/api/auth/me", {
      headers: { cookie: userCookie },
    });
    check(
      meWithPolicy.body?.user?.activeRestrictions?.some(
        (item) =>
          item.id === restrictionId &&
          item.reason === "Scoped schedule smoke policy",
      ),
      "Active policy reason and period are missing from the user session",
    );
    await removeRestriction(restrictionId);

    restrictionId = await createRestriction(
      "BOOKING_CREATE",
      "Booking creation smoke policy",
    );
    const startsAt = bookingCandidates(
      process.env.OFFICE_TIME_ZONE ?? "Europe/Kyiv",
    )[0];
    await expectRestricted(
      "/api/bookings",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: userCookie,
        },
        body: JSON.stringify({
          roomId: room.id,
          title: "Restricted creation smoke",
          startsAt: startsAt.toISOString(),
          endsAt: new Date(startsAt.getTime() + 30 * 60_000).toISOString(),
        }),
      },
      "BOOKING_CREATE",
    );
    await removeRestriction(restrictionId);

    let ownedBooking;
    for (const candidate of bookingCandidates(
      process.env.OFFICE_TIME_ZONE ?? "Europe/Kyiv",
    )) {
      const response = await fetch(`${baseUrl}/api/bookings`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: userCookie,
        },
        body: JSON.stringify({
          roomId: room.id,
          title: `Restricted cancellation smoke ${Date.now()}`,
          startsAt: candidate.toISOString(),
          endsAt: new Date(candidate.getTime() + 30 * 60_000).toISOString(),
        }),
      });
      const body = await response.json();
      if (response.status === 409) continue;
      check(
        response.status === 201,
        `Policy fixture booking failed: ${JSON.stringify(body)}`,
      );
      ownedBooking = body;
      break;
    }
    check(ownedBooking?.id, "Could not create policy fixture booking");
    restrictionId = await createRestriction(
      "BOOKING_CANCEL_OWN",
      "Own cancellation smoke policy",
      room.id,
    );
    await expectRestricted(
      `/api/bookings/${ownedBooking.id}`,
      {
        method: "DELETE",
        headers: {
          "content-type": "application/json",
          cookie: userCookie,
        },
        body: JSON.stringify({ reason: "Restricted cancellation attempt" }),
      },
      "BOOKING_CANCEL_OWN",
    );
    await removeRestriction(restrictionId);
    await request(`/api/bookings/${ownedBooking.id}`, {
      method: "DELETE",
      headers: { cookie: adminCookie },
      body: JSON.stringify({ reason: "Capability policy smoke cleanup" }),
    });

    restrictionId = await createRestriction(
      "ACCOUNT_LOGIN",
      "Account login smoke policy",
    );
    await expectRestricted(
      "/api/auth/me",
      { headers: { cookie: userCookie } },
      "ACCOUNT_LOGIN",
    );
    await expectRestricted(
      "/api/auth/login",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(credentials),
      },
      "ACCOUNT_LOGIN",
    );
    await removeRestriction(restrictionId);
    check(
      await login(credentials),
      "Login did not recover after policy revoke",
    );
  } finally {
    for (const restrictionId of [...restrictions]) {
      await fetch(`${baseUrl}/api/admin/restrictions/${restrictionId}`, {
        method: "DELETE",
        headers: { cookie: adminCookie },
      });
    }
  }
}

async function verifyRecurringBookings(cookie, room) {
  const timeZone = process.env.OFFICE_TIME_ZONE ?? "Europe/Kyiv";
  let created;
  let firstStart;

  for (const startsAt of bookingCandidates(timeZone)) {
    const localWeekday = localParts(startsAt, timeZone).weekday;
    const weekday = {
      Sun: 0,
      Mon: 1,
      Tue: 2,
      Wed: 3,
      Thu: 4,
      Fri: 5,
      Sat: 6,
    }[localWeekday];
    const recurrenceUntil = new Date(
      startsAt.getTime() + 14 * 24 * 60 * 60_000,
    );
    const response = await fetch(`${baseUrl}/api/bookings`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie,
      },
      body: JSON.stringify({
        roomId: room.id,
        title: `Recurring booking smoke ${Date.now()}`,
        startsAt: startsAt.toISOString(),
        endsAt: new Date(startsAt.getTime() + 30 * 60_000).toISOString(),
        participationMode: "INVITE_ONLY",
        participantIds: [],
        recurrence: "WEEKLY",
        recurrenceInterval: 1,
        weekdays: [weekday],
        recurrenceUntil: dateKey(recurrenceUntil, timeZone),
      }),
    });
    const body = await response.json();
    if (response.status === 409) continue;
    check(
      response.status === 201,
      `Recurring booking creation failed: ${JSON.stringify(body)}`,
    );
    created = body;
    firstStart = startsAt;
    break;
  }

  check(
    created?.seriesId && created?.occurrenceCount === 3,
    "Weekly booking series did not create three occurrences",
  );
  const rangeFrom = new Date(firstStart.getTime() - 60 * 60_000);
  const rangeTo = new Date(firstStart.getTime() + 15 * 24 * 60 * 60_000);
  const schedulePath =
    `/api/bookings/schedule?roomId=${room.id}` +
    `&from=${encodeURIComponent(rangeFrom.toISOString())}` +
    `&to=${encodeURIComponent(rangeTo.toISOString())}`;
  const schedule = await request(schedulePath, { headers: { cookie } });
  const occurrences = schedule.body.bookings
    .filter((booking) => booking.seriesId === created.seriesId)
    .sort(
      (left, right) =>
        new Date(left.startsAt).getTime() - new Date(right.startsAt).getTime(),
    );
  check(
    occurrences.length === 3,
    "Booking series is not fully visible in the schedule",
  );

  const editedTitle = `Edited recurring occurrence ${Date.now()}`;
  await request(`/api/bookings/${occurrences[1].id}`, {
    method: "PATCH",
    headers: { cookie },
    body: JSON.stringify({
      title: editedTitle,
      startsAt: occurrences[1].startsAt,
      endsAt: occurrences[1].endsAt,
      participationMode: occurrences[1].participationMode,
      participantIds: [],
    }),
  });
  const scheduleAfterEdit = await request(schedulePath, {
    headers: { cookie },
  });
  const afterEdit = scheduleAfterEdit.body.bookings.filter(
    (booking) => booking.seriesId === created.seriesId,
  );
  check(
    afterEdit.filter((booking) => booking.title === editedTitle).length === 1,
    "Editing one recurring occurrence changed more than that occurrence",
  );

  await request(`/api/bookings/${occurrences[1].id}`, {
    method: "DELETE",
    headers: { cookie },
    body: JSON.stringify({ scope: "FUTURE" }),
  });
  const scheduleAfterCancellation = await request(schedulePath, {
    headers: { cookie },
  });
  const remaining = scheduleAfterCancellation.body.bookings.filter(
    (booking) => booking.seriesId === created.seriesId,
  );
  check(
    remaining.length === 1 && remaining[0].id === occurrences[0].id,
    "Future series cancellation did not preserve only earlier occurrences",
  );
  await request(`/api/bookings/${occurrences[0].id}`, {
    method: "DELETE",
    headers: { cookie },
    body: JSON.stringify({ scope: "OCCURRENCE" }),
  });
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
  const secondUserCookie = await login(securityCredentials);
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
  await verifyCriticalBookingGuards(
    userCookie,
    secondUserCookie,
    roomsResult.body.rooms.at(-1),
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
  check(
    users.body?.pagination?.total >= users.body.users.length,
    "Admin user pagination metadata is invalid",
  );
  const policyUser = users.body.users.find(
    (user) => user.email === securityCredentials.email,
  );
  check(policyUser, "Policy smoke user is missing from admin management");
  const searchedUsers = await request(
    `/api/admin/users?search=${encodeURIComponent(
      securityCredentials.email,
    )}&page=1&limit=1`,
    { headers: { cookie: adminCookie } },
  );
  check(
    searchedUsers.body?.users?.length === 1 &&
      searchedUsers.body.users[0].id === policyUser.id &&
      searchedUsers.body.pagination?.total === 1,
    "Admin user search and pagination are inconsistent",
  );
  const deliveries = await request(
    "/api/admin/notification-deliveries?page=1&limit=3",
    { headers: { cookie: adminCookie } },
  );
  check(
    Array.isArray(deliveries.body?.deliveries) &&
      deliveries.body.deliveries.length <= 3 &&
      deliveries.body.pagination?.limit === 3 &&
      ["pending", "processing", "sent", "failed", "exhausted"].every((key) =>
        Number.isInteger(deliveries.body.summary?.[key]),
      ),
    "Admin notification delivery operations response is invalid",
  );
  await verifyCapabilityPolicies({
    adminCookie,
    userCookie: secondUserCookie,
    credentials: securityCredentials,
    userId: policyUser.id,
    room: roomsResult.body.rooms.at(-1),
  });
  await verifyRecurringBookings(userCookie, roomsResult.body.rooms.at(-1));

  const managedBookings = await request(
    `/api/admin/bookings?status=cancelled&search=${encodeURIComponent(
      booking.title,
    )}&page=1&limit=1`,
    { headers: { cookie: adminCookie } },
  );
  check(
    managedBookings.body?.pagination?.page === 1 &&
      managedBookings.body.pagination.limit === 1 &&
      managedBookings.body.pagination.total >= 1,
    "Admin booking pagination metadata is invalid",
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
  const imagePadding = `<!--${"x".repeat(4 * 1024 * 1024)}-->`;
  roomImageForm.set(
    "image",
    new Blob(
      [
        '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="18">' +
          '<rect width="32" height="18" fill="#0878f9"/>' +
          imagePadding +
          "</svg>",
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
      "critical booking guards and concurrency, colleagues, events, preferences, " +
      "capability policies, recurring bookings, booking and delivery management, room image lifecycle, working hours, " +
      "working days, recurring unavailability, account credentials and administration",
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
