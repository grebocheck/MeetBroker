alter table notification_outbox
  add column updated_at timestamptz not null default now();

create index notification_outbox_processing_idx
  on notification_outbox(updated_at)
  where status = 'PROCESSING';
