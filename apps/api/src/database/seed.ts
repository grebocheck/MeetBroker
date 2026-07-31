import "reflect-metadata";
import * as argon2 from "argon2";
import { addDays, set } from "date-fns";
import { fromZonedTime, toZonedTime } from "date-fns-tz";
import { Client } from "pg";

const ADMIN_ID = "00000000-0000-4000-8000-000000000001";
const USER_ID = "00000000-0000-4000-8000-000000000002";
const SECOND_USER_ID = "00000000-0000-4000-8000-000000000003";
const OFFICE_TIME_ZONE = "Europe/Kyiv";

const rooms = [
  ["10000000-0000-4000-8000-000000000001", "Акваріум", 3, 8],
  ["10000000-0000-4000-8000-000000000002", "Марс", 5, 10],
  ["10000000-0000-4000-8000-000000000003", "Гагарін", 2, 6],
  ["10000000-0000-4000-8000-000000000004", "Дніпро", 4, 12],
  ["10000000-0000-4000-8000-000000000005", "Софія", 6, 4],
  ["10000000-0000-4000-8000-000000000006", "Обрій", 7, 16],
] as const;

async function seed(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required");

  const client = new Client({ connectionString });
  await client.connect();
  try {
    const [adminHash, userHash] = await Promise.all([
      argon2.hash("Admin123!"),
      argon2.hash("User12345!"),
    ]);
    await client.query("begin");

    await client.query(
      `
        insert into users (
          id, name, email, password_hash, bio, avatar_preset, role,
          email_verified_at, approved_at
        )
        values
          ($1, 'Олена Адміністратор', 'admin@meetbroker.local', $2,
            'Допомагаю офісу працювати без накладок.', 'avatar-03', 'ADMIN',
            now(), now()),
          ($3, 'Ігор Коваль', 'user@meetbroker.local', $4,
            'Продуктовий менеджер, люблю чіткі плани.', 'avatar-10', 'USER',
            now(), now()),
          ($5, 'Анна Левченко', 'anna@meetbroker.local', $4,
            'Дизайн і дослідження користувачів.', 'avatar-01', 'USER',
            now(), now())
        on conflict (id) do update set
          name = excluded.name,
          email = excluded.email,
          password_hash = excluded.password_hash,
          bio = excluded.bio,
          avatar_preset = excluded.avatar_preset,
          avatar_path = null,
          role = excluded.role,
          pending_email = null,
          email_verified_at = now(),
          approved_at = now(),
          access_revoked_at = null,
          updated_at = now()
      `,
      [ADMIN_ID, adminHash, USER_ID, userHash, SECOND_USER_ID],
    );

    for (const [id, name, floor, capacity] of rooms) {
      await client.query(
        `
          insert into rooms (id, name, floor, capacity)
          values ($1, $2, $3, $4)
          on conflict (id) do update set
            name = excluded.name,
            floor = excluded.floor,
            capacity = excluded.capacity,
            updated_at = now()
        `,
        [id, name, floor, capacity],
      );
    }

    for (const userId of [ADMIN_ID, USER_ID, SECOND_USER_ID]) {
      await client.query(
        `
          insert into notification_preferences (user_id)
          values ($1)
          on conflict (user_id) do nothing
        `,
        [userId],
      );
      await client.query(
        `
          insert into notification_subscriptions
            (user_id, category, channel, enabled)
          select
            $1,
            category,
            channel,
            channel = 'IN_APP'
          from unnest(
            array['INVITATIONS', 'CHANGES', 'REMINDERS', 'ACCESS']
          ) as categories(category)
          cross join unnest(
            array['IN_APP', 'EMAIL', 'TELEGRAM']
          ) as channels(channel)
          on conflict (user_id, category, channel) do nothing
        `,
        [userId],
      );
    }

    await client.query(
      "delete from user_restrictions where user_id = any($1::uuid[])",
      [[ADMIN_ID, USER_ID, SECOND_USER_ID]],
    );

    const demoBookings = [
      {
        id: "20000000-0000-4000-8000-000000000001",
        roomId: rooms[0][0],
        organizerId: USER_ID,
        title: "Планування релізу",
        startsAt: demoInstant(1, 10, 0),
        durationMinutes: 90,
        participationMode: "OPEN",
        participantId: SECOND_USER_ID,
        participantStatus: "ACCEPTED",
      },
      {
        id: "20000000-0000-4000-8000-000000000002",
        roomId: rooms[1][0],
        organizerId: ADMIN_ID,
        title: "Синхронізація команди",
        startsAt: demoInstant(2, 14, 0),
        durationMinutes: 60,
        participationMode: "INVITE_ONLY",
        participantId: USER_ID,
        participantStatus: "INVITED",
      },
      {
        id: "20000000-0000-4000-8000-000000000003",
        roomId: rooms[2][0],
        organizerId: SECOND_USER_ID,
        title: "Огляд дизайн-системи",
        startsAt: demoInstant(3, 11, 30),
        durationMinutes: 60,
        participationMode: "INVITE_ONLY",
        participantId: ADMIN_ID,
        participantStatus: "ACCEPTED",
      },
    ] as const;
    await client.query("delete from bookings where id = any($1::uuid[])", [
      demoBookings.map(({ id }) => id),
    ]);

    for (const booking of demoBookings) {
      const endsAt = new Date(
        booking.startsAt.getTime() + booking.durationMinutes * 60_000,
      );
      await client.query(
        `
          insert into bookings (
            id, room_id, organizer_id, title, starts_at, ends_at,
            participation_mode
          )
          values ($1, $2, $3, $4, $5, $6, $7)
        `,
        [
          booking.id,
          booking.roomId,
          booking.organizerId,
          booking.title,
          booking.startsAt,
          endsAt,
          booking.participationMode,
        ],
      );
      await client.query(
        `
          insert into booking_participants
            (booking_id, user_id, status, responded_at)
          values (
            $1, $2, $3::varchar,
            case when $3::varchar = 'INVITED' then null else now() end
          )
        `,
        [booking.id, booking.participantId, booking.participantStatus],
      );
    }

    await client.query("commit");
    process.stdout.write("Seed data is ready\n");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    await client.end();
  }
}

function demoInstant(
  workingDayOffset: number,
  hours: number,
  minutes: number,
): Date {
  let localDate = toZonedTime(new Date(), OFFICE_TIME_ZONE);
  let remaining = workingDayOffset;
  while (remaining > 0) {
    localDate = addDays(localDate, 1);
    const weekday = localDate.getDay();
    if (weekday !== 0 && weekday !== 6) remaining -= 1;
  }
  return fromZonedTime(
    set(localDate, { hours, minutes, seconds: 0, milliseconds: 0 }),
    OFFICE_TIME_ZONE,
  );
}

seed().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.stack : String(error)}\n`,
  );
  process.exitCode = 1;
});
