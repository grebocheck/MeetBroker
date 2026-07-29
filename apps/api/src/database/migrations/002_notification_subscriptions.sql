create table notification_subscriptions (
  user_id uuid not null references users(id) on delete cascade,
  category text not null check (
    category in ('INVITATIONS', 'CHANGES', 'REMINDERS', 'ACCESS')
  ),
  channel text not null check (
    channel in ('IN_APP', 'EMAIL', 'TELEGRAM')
  ),
  enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (user_id, category, channel)
);

insert into notification_subscriptions
  (user_id, category, channel, enabled)
select
  p.user_id,
  category.name,
  channel.name,
  case
    when channel.name = 'IN_APP' then
      case category.name
        when 'INVITATIONS' then p.invitations
        when 'CHANGES' then p.changes
        when 'REMINDERS' then p.reminders
        else true
      end
    when channel.name = 'EMAIL' then
      p.email_enabled and
      case category.name
        when 'INVITATIONS' then p.invitations
        when 'CHANGES' then p.changes
        when 'REMINDERS' then p.reminders
        else true
      end
    when channel.name = 'TELEGRAM' then
      p.telegram_enabled and
      case category.name
        when 'INVITATIONS' then p.invitations
        when 'CHANGES' then p.changes
        when 'REMINDERS' then p.reminders
        else false
      end
  end
from notification_preferences p
cross join (
  values ('INVITATIONS'), ('CHANGES'), ('REMINDERS'), ('ACCESS')
) as category(name)
cross join (
  values ('IN_APP'), ('EMAIL'), ('TELEGRAM')
) as channel(name);

create index notification_subscriptions_delivery_idx
  on notification_subscriptions (user_id, category, channel)
  where enabled;
