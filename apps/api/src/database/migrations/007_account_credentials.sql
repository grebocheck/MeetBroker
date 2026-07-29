alter table users
  add column pending_email varchar(320);

create unique index users_pending_email_normalized_unique
  on users (lower(trim(pending_email)))
  where pending_email is not null;

alter table email_verification_tokens
  add column pending_email varchar(320);

create index email_verification_tokens_pending_email_idx
  on email_verification_tokens (lower(trim(pending_email)))
  where pending_email is not null and used_at is null;
