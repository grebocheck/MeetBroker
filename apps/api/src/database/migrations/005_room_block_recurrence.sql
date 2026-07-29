create table room_block_series (
  id uuid primary key,
  room_id uuid not null references rooms(id) on delete cascade,
  title varchar(100) not null,
  private_note varchar(300),
  frequency varchar(20) not null
    check (frequency in ('DAILY', 'WEEKLY')),
  recurrence_interval integer not null
    check (recurrence_interval between 1 and 30),
  weekdays smallint[],
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  recurrence_until date not null,
  timezone varchar(100) not null,
  created_by uuid not null references users(id),
  created_at timestamptz not null default now(),
  cancelled_at timestamptz,
  cancelled_by uuid references users(id),
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

create index room_block_series_room_idx
  on room_block_series(room_id, cancelled_at, recurrence_until);

alter table room_blocks
  add column series_id uuid references room_block_series(id) on delete cascade,
  add column occurrence_index integer;

create unique index room_blocks_series_occurrence_idx
  on room_blocks(series_id, occurrence_index)
  where series_id is not null;
