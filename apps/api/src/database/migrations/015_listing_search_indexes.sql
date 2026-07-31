create extension if not exists pg_trgm;

create index if not exists users_name_trgm_idx
  on users using gin (name gin_trgm_ops);

create index if not exists users_email_trgm_idx
  on users using gin (email gin_trgm_ops);

create index if not exists rooms_name_trgm_idx
  on rooms using gin (name gin_trgm_ops);

create index if not exists bookings_title_trgm_idx
  on bookings using gin (title gin_trgm_ops);

create index if not exists bookings_open_upcoming_idx
  on bookings (starts_at, id)
  where participation_mode = 'OPEN' and cancelled_at is null;

create index if not exists bookings_organizer_time_idx
  on bookings (organizer_id, starts_at desc)
  where cancelled_at is null;

create index if not exists booking_participants_user_status_booking_idx
  on booking_participants (user_id, status, booking_id);

create index if not exists notification_outbox_status_created_idx
  on notification_outbox (status, created_at desc);
