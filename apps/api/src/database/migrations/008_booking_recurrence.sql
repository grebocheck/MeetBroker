create table booking_series (
  id uuid primary key,
  organizer_id uuid not null references users(id),
  room_id uuid not null references rooms(id),
  frequency varchar(20) not null
    check (frequency in ('DAILY', 'WEEKLY')),
  recurrence_interval integer not null
    check (recurrence_interval between 1 and 30),
  weekdays smallint[],
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  recurrence_until date not null,
  timezone varchar(100) not null,
  cancelled_from timestamptz,
  created_at timestamptz not null default now(),
  check (starts_at < ends_at),
  check (
    (frequency = 'DAILY' and weekdays is null)
    or (
      frequency = 'WEEKLY'
      and weekdays is not null
      and cardinality(weekdays) between 1 and 7
    )
  )
);

create index booking_series_organizer_idx
  on booking_series(organizer_id, cancelled_from, recurrence_until);

alter table bookings
  add column series_id uuid references booking_series(id) on delete set null,
  add column occurrence_index integer;

create unique index bookings_series_occurrence_idx
  on bookings(series_id, occurrence_index)
  where series_id is not null;
