const baseUrl = (process.env.BASE_URL ?? "http://localhost:8080").replace(
  /\/$/,
  ""
);
const userCredentials = {
  email: process.env.SMOKE_USER_EMAIL ?? "user@meetbroker.local",
  password: process.env.SMOKE_USER_PASSWORD ?? "User12345!"
};
const adminCredentials = {
  email: process.env.SMOKE_ADMIN_EMAIL ?? "admin@meetbroker.local",
  password: process.env.SMOKE_ADMIN_PASSWORD ?? "Admin123!"
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
      ...options.headers
    }
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
      `${options.method ?? "GET"} ${path} returned ${response.status}: ${details}`
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
    body: JSON.stringify(credentials)
  });
  const setCookie =
    response.headers.getSetCookie?.()[0] ?? response.headers.get("set-cookie");
  check(setCookie, `Login for ${credentials.email} did not set a session cookie`);
  check(body?.user?.email === credentials.email, "Login returned another user");
  return setCookie.split(";", 1)[0];
}

function localParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);

  return Object.fromEntries(
    parts.filter(({ type }) => type !== "literal").map(({ type, value }) => [
      type,
      value
    ])
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

async function createAndCancelBooking(cookie, room) {
  for (const startsAt of bookingCandidates(
    process.env.OFFICE_TIME_ZONE ?? "Europe/Kyiv"
  )) {
    const endsAt = new Date(startsAt.getTime() + 30 * 60_000);
    const response = await fetch(`${baseUrl}/api/bookings`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie
      },
      body: JSON.stringify({
        roomId: room.id,
        title: `MVP smoke ${Date.now()}`,
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        participationMode: "INVITE_ONLY"
      })
    });
    const body = await response.json();

    if (response.status === 409) {
      continue;
    }
    check(response.ok, `Booking creation failed: ${JSON.stringify(body)}`);
    check(body.id, "Booking creation did not return an id");

    await request(`/api/bookings/${body.id}`, {
      method: "DELETE",
      headers: { cookie },
      body: JSON.stringify({ reason: "Automated smoke verification" })
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
    "Frontend entry page is missing"
  );

  const userCookie = await login(userCredentials);
  const roomsResult = await request("/api/rooms", {
    headers: { cookie: userCookie }
  });
  check(roomsResult.body?.rooms?.length >= 2, "Expected at least two seeded rooms");

  const colleagues = await request("/api/users/colleagues", {
    headers: { cookie: userCookie }
  });
  check(
    Array.isArray(colleagues.body?.users),
    "Colleagues response must contain a resolved users array"
  );

  const booking = await createAndCancelBooking(
    userCookie,
    roomsResult.body.rooms[1]
  );

  const openEvents = await request("/api/bookings/open", {
    headers: { cookie: userCookie }
  });
  check(Array.isArray(openEvents.body?.events), "Open events response is invalid");

  const preferences = await request("/api/notifications/preferences", {
    headers: { cookie: userCookie }
  });
  check(
    Array.isArray(preferences.body?.subscriptions) &&
      preferences.body.subscriptions.length === 12,
    "Notification preferences response is invalid"
  );
  const invitationsByEmail = preferences.body.subscriptions.find(
    (item) => item.category === "INVITATIONS" && item.channel === "EMAIL"
  );
  const updatedPreferences = await request("/api/notifications/preferences", {
    method: "PATCH",
    headers: { cookie: userCookie },
    body: JSON.stringify({
      category: "INVITATIONS",
      channel: "EMAIL",
      enabled: !invitationsByEmail.enabled
    })
  });
  check(
    updatedPreferences.body?.subscriptions?.some(
      (item) =>
        item.category === "INVITATIONS" &&
        item.channel === "EMAIL" &&
        item.enabled === !invitationsByEmail.enabled
    ),
    "Notification preference matrix update failed"
  );
  await request("/api/notifications/preferences", {
    method: "PATCH",
    headers: { cookie: userCookie },
    body: JSON.stringify({
      category: "INVITATIONS",
      channel: "EMAIL",
      enabled: invitationsByEmail.enabled
    })
  });

  const adminCookie = await login(adminCredentials);
  const users = await request("/api/admin/users", {
    headers: { cookie: adminCookie }
  });
  check(users.body?.users?.length >= 3, "Expected seeded users in admin response");

  const roomImageForm = new FormData();
  roomImageForm.set(
    "image",
    new Blob(
      [
        '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="18">' +
          '<rect width="32" height="18" fill="#0878f9"/></svg>'
      ],
      { type: "image/svg+xml" }
    ),
    "smoke-room.svg"
  );
  const imageUpload = await fetch(
    `${baseUrl}/api/admin/rooms/${roomsResult.body.rooms[0].id}/image`,
    {
      method: "POST",
      headers: { cookie: adminCookie },
      body: roomImageForm
    }
  );
  const imageUploadBody = await imageUpload.json();
  check(
    imageUpload.ok && imageUploadBody?.imageUrl?.endsWith(".webp"),
    `Room image upload failed: ${JSON.stringify(imageUploadBody)}`
  );
  const roomsWithImage = await request("/api/rooms", {
    headers: { cookie: adminCookie }
  });
  check(
    roomsWithImage.body.rooms[0].imageUrl === imageUploadBody.imageUrl,
    "Uploaded room image was not returned by the rooms API"
  );
  await request(
    `/api/admin/rooms/${roomsResult.body.rooms[0].id}/image`,
    {
      method: "DELETE",
      headers: { cookie: adminCookie }
    }
  );
  const roomsWithoutImage = await request("/api/rooms", {
    headers: { cookie: adminCookie }
  });
  check(
    roomsWithoutImage.body.rooms[0].imageUrl === null,
    "Room image removal did not restore the placeholder state"
  );

  const audit = await request("/api/admin/audit", {
    headers: { cookie: adminCookie }
  });
  check(Array.isArray(audit.body?.logs), "Admin audit response is invalid");

  console.log(
    `Smoke passed: UI, health, auth, rooms, booking ${booking.id} create/cancel, ` +
      "colleagues, events, preferences, room image lifecycle and administration"
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
