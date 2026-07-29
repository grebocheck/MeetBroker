with demo as (
  select
    '30000000-0000-4000-8000-000000000001'::uuid as series_id,
    r.id as room_id,
    u.id as admin_id,
    (date_trunc('week', current_date) + interval '1 week')::date as first_day
  from rooms r
  cross join users u
  where r.name = 'Акваріум'
    and u.email = 'admin@meetbroker.local'
)
insert into room_block_series (
  id,
  room_id,
  title,
  private_note,
  frequency,
  recurrence_interval,
  weekdays,
  starts_at,
  ends_at,
  recurrence_until,
  timezone,
  created_by
)
select
  series_id,
  room_id,
  'Ранкове прибирання',
  'Демонстраційний приклад регулярної недоступності',
  'WEEKLY',
  1,
  array[1, 3]::smallint[],
  (first_day + time '08:30') at time zone 'Europe/Kyiv',
  (first_day + time '09:00') at time zone 'Europe/Kyiv',
  first_day + 28,
  'Europe/Kyiv',
  admin_id
from demo
on conflict (id) do nothing;

with demo as (
  select
    '30000000-0000-4000-8000-000000000001'::uuid as series_id,
    r.id as room_id,
    u.id as admin_id,
    (date_trunc('week', current_date) + interval '1 week')::date as first_day
  from rooms r
  cross join users u
  where r.name = 'Акваріум'
    and u.email = 'admin@meetbroker.local'
),
occurrences as (
  select
    demo.*,
    day::date as occurrence_day,
    row_number() over (order by day) - 1 as occurrence_index
  from demo
  cross join lateral generate_series(
    demo.first_day,
    demo.first_day + 28,
    interval '1 day'
  ) day
  where extract(dow from day) in (1, 3)
)
insert into room_blocks (
  id,
  room_id,
  title,
  private_note,
  starts_at,
  ends_at,
  created_by,
  series_id,
  occurrence_index
)
select
  (
    '31000000-0000-4000-8000-' ||
    lpad((occurrence_index + 1)::text, 12, '0')
  )::uuid,
  room_id,
  'Ранкове прибирання',
  'Демонстраційний приклад регулярної недоступності',
  (occurrence_day + time '08:30') at time zone 'Europe/Kyiv',
  (occurrence_day + time '09:00') at time zone 'Europe/Kyiv',
  admin_id,
  series_id,
  occurrence_index
from occurrences
on conflict (id) do nothing;

insert into room_blocks (
  id,
  room_id,
  title,
  private_note,
  starts_at,
  ends_at,
  created_by
)
select
  '30000000-0000-4000-8000-000000000002'::uuid,
  r.id,
  'Перевірка проєктора',
  'Демонстраційний приклад разової недоступності',
  ((current_date + 1) + time '16:00') at time zone 'Europe/Kyiv',
  ((current_date + 1) + time '17:30') at time zone 'Europe/Kyiv',
  u.id
from rooms r
cross join users u
where r.name = 'Марс'
  and u.email = 'admin@meetbroker.local'
on conflict (id) do nothing;
