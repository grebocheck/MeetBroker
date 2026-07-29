create extension if not exists btree_gist;

create table users (
  id uuid primary key,
  name varchar(120) not null,
  email varchar(320) not null,
  password_hash text not null,
  bio varchar(300),
  avatar_preset varchar(40) not null default 'avatar-01',
  avatar_path text,
  role varchar(20) not null default 'USER' check (role in ('USER', 'ADMIN')),
  locale varchar(10) not null default 'uk' check (locale in ('uk', 'en')),
  theme varchar(10) not null default 'SYSTEM' check (theme in ('SYSTEM', 'LIGHT', 'DARK')),
  timezone varchar(80),
  email_verified_at timestamptz,
  approved_at timestamptz,
  approved_by uuid references users(id),
  access_revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index users_email_normalized_unique on users (lower(trim(email)));

create table sessions (
  id uuid primary key,
  user_id uuid not null references users(id) on delete cascade,
  token_hash char(64) not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index sessions_user_id_idx on sessions(user_id);

create table email_verification_tokens (
  id uuid primary key,
  user_id uuid not null references users(id) on delete cascade,
  token_hash char(64) not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create table rooms (
  id uuid primary key,
  name varchar(100) not null unique,
  floor integer not null,
  capacity integer not null check (capacity > 0),
  work_start time not null default '09:00',
  work_end time not null default '19:00',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (work_start < work_end)
);

create table user_restrictions (
  id uuid primary key,
  user_id uuid not null references users(id) on delete cascade,
  capability varchar(80) not null,
  room_id uuid references rooms(id) on delete cascade,
  starts_at timestamptz not null default now(),
  expires_at timestamptz,
  reason varchar(300) not null,
  created_by uuid not null references users(id),
  revoked_at timestamptz,
  revoked_by uuid references users(id),
  created_at timestamptz not null default now(),
  check (expires_at is null or expires_at > starts_at)
);
create index user_restrictions_active_idx
  on user_restrictions(user_id, capability, starts_at, expires_at)
  where revoked_at is null;

create table room_blocks (
  id uuid primary key,
  room_id uuid not null references rooms(id) on delete cascade,
  title varchar(100) not null,
  private_note varchar(300),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  created_by uuid not null references users(id),
  created_at timestamptz not null default now(),
  cancelled_at timestamptz,
  check (starts_at < ends_at)
);
create index room_blocks_room_time_idx on room_blocks(room_id, starts_at, ends_at);

create table bookings (
  id uuid primary key,
  room_id uuid not null references rooms(id),
  organizer_id uuid not null references users(id),
  title varchar(100) not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  participation_mode varchar(20) not null default 'INVITE_ONLY'
    check (participation_mode in ('INVITE_ONLY', 'OPEN')),
  override_reason varchar(300),
  cancelled_at timestamptz,
  cancelled_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (starts_at < ends_at)
);
create index bookings_room_time_idx on bookings(room_id, starts_at, ends_at);
alter table bookings add constraint bookings_no_overlap
  exclude using gist (
    room_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  )
  where (cancelled_at is null);

create table booking_participants (
  booking_id uuid not null references bookings(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  status varchar(20) not null check (status in ('INVITED', 'ACCEPTED', 'DECLINED')),
  invited_at timestamptz not null default now(),
  responded_at timestamptz,
  primary key (booking_id, user_id)
);
create index booking_participants_user_idx
  on booking_participants(user_id, status);

create table notifications (
  id uuid primary key,
  user_id uuid not null references users(id) on delete cascade,
  type varchar(60) not null,
  title varchar(160) not null,
  body text not null,
  booking_id uuid references bookings(id) on delete cascade,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_created_idx
  on notifications(user_id, created_at desc);

create table notification_preferences (
  user_id uuid primary key references users(id) on delete cascade,
  email_enabled boolean not null default true,
  telegram_enabled boolean not null default false,
  invitations boolean not null default true,
  changes boolean not null default true,
  reminders boolean not null default true,
  updated_at timestamptz not null default now()
);

create table telegram_connections (
  user_id uuid primary key references users(id) on delete cascade,
  chat_id text not null unique,
  connected_at timestamptz not null default now()
);

create table telegram_link_tokens (
  id uuid primary key,
  user_id uuid not null references users(id) on delete cascade,
  token_hash char(64) not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create table notification_outbox (
  id uuid primary key,
  event_key varchar(180) not null unique,
  event_type varchar(80) not null,
  payload jsonb not null,
  status varchar(20) not null default 'PENDING'
    check (status in ('PENDING', 'PROCESSING', 'SENT', 'FAILED')),
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_error varchar(500),
  processed_at timestamptz,
  created_at timestamptz not null default now()
);
create index notification_outbox_pending_idx
  on notification_outbox(next_attempt_at)
  where status in ('PENDING', 'FAILED');

create table audit_logs (
  id uuid primary key,
  actor_id uuid references users(id),
  action varchar(100) not null,
  target_type varchar(60) not null,
  target_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_logs_created_idx on audit_logs(created_at desc);
