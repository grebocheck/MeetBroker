alter table bookings
  alter column room_id drop not null,
  add column meeting_type varchar(20) not null default 'ROOM',
  add column meeting_url varchar(2048),
  add constraint bookings_meeting_location_check check (
    (
      meeting_type = 'ROOM'
      and room_id is not null
      and meeting_url is null
    )
    or (
      meeting_type = 'ONLINE'
      and room_id is null
      and meeting_url is not null
      and meeting_url ~* '^https://'
    )
  );

alter table booking_series
  alter column room_id drop not null,
  add column meeting_type varchar(20) not null default 'ROOM',
  add column meeting_url varchar(2048),
  add constraint booking_series_meeting_location_check check (
    (
      meeting_type = 'ROOM'
      and room_id is not null
      and meeting_url is null
    )
    or (
      meeting_type = 'ONLINE'
      and room_id is null
      and meeting_url is not null
      and meeting_url ~* '^https://'
    )
  );

create index bookings_attendee_time_idx
  on bookings(organizer_id, starts_at, ends_at)
  where cancelled_at is null;
