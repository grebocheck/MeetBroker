import "reflect-metadata";
import { randomUUID } from "node:crypto";
import * as argon2 from "argon2";
import { addDays, set } from "date-fns";
import { fromZonedTime } from "date-fns-tz";
import { Client } from "pg";

const ADMIN_ID = "00000000-0000-4000-8000-000000000001";
const USER_ID = "00000000-0000-4000-8000-000000000002";
const SECOND_USER_ID = "00000000-0000-4000-8000-000000000003";

const rooms = [
  ["10000000-0000-4000-8000-000000000001", "Акваріум", 3, 8],
  ["10000000-0000-4000-8000-000000000002", "Марс", 5, 10],
  ["10000000-0000-4000-8000-000000000003", "Гагарін", 2, 6],
  ["10000000-0000-4000-8000-000000000004", "Дніпро", 4, 12],
  ["10000000-0000-4000-8000-000000000005", "Софія", 6, 4],
  ["10000000-0000-4000-8000-000000000006", "Обрій", 7, 16]
] as const;

async function seed(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required");

  const client = new Client({ connectionString });
  await client.connect();
  try {
    const [adminHash, userHash] = await Promise.all([
      argon2.hash("Admin123!"),
      argon2.hash("User12345!")
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
          password_hash = excluded.password_hash,
          email_verified_at = coalesce(users.email_verified_at, now()),
          approved_at = coalesce(users.approved_at, now())
      `,
      [ADMIN_ID, adminHash, USER_ID, userHash, SECOND_USER_ID]
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
        [id, name, floor, capacity]
      );
    }

    for (const userId of [ADMIN_ID, USER_ID, SECOND_USER_ID]) {
      await client.query(
        `
          insert into notification_preferences (user_id)
          values ($1)
          on conflict (user_id) do nothing
        `,
        [userId]
      );
      await client.query(
        `
          insert into notification_subscriptions
            (user_id, category, channel, enabled)
          select
            $1,
            category,
            channel,
            channel <> 'TELEGRAM'
          from unnest(
            array['INVITATIONS', 'CHANGES', 'REMINDERS', 'ACCESS']
          ) as categories(category)
          cross join unnest(
            array['IN_APP', 'EMAIL', 'TELEGRAM']
          ) as channels(channel)
          on conflict (user_id, category, channel) do nothing
        `,
        [userId]
      );
    }

    const localBase = set(addDays(new Date(), 2), {
      hours: 10,
      minutes: 0,
      seconds: 0,
      milliseconds: 0
    });
    const startsAt = fromZonedTime(localBase, "Europe/Kyiv");
    const endsAt = new Date(startsAt.getTime() + 90 * 60_000);
    await client.query(
      `
        insert into bookings (
          id, room_id, organizer_id, title, starts_at, ends_at,
          participation_mode
        )
        values ($1, $2, $3, 'Планування релізу', $4, $5, 'OPEN')
        on conflict (id) do nothing
      `,
      [
        "20000000-0000-4000-8000-000000000001",
        rooms[0][0],
        USER_ID,
        startsAt,
        endsAt
      ]
    );
    await client.query(
      `
        insert into booking_participants
          (booking_id, user_id, status, responded_at)
        values ($1, $2, 'ACCEPTED', now())
        on conflict (booking_id, user_id) do nothing
      `,
      ["20000000-0000-4000-8000-000000000001", SECOND_USER_ID]
    );

    await client.query("commit");
    process.stdout.write("Seed data is ready\n");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    await client.end();
  }
}

seed().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.stack : String(error)}\n`
  );
  process.exitCode = 1;
});
