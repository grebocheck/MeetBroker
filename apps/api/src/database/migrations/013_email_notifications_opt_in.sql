update notification_subscriptions
set enabled = false,
    updated_at = now()
where channel = 'EMAIL'
  and enabled = true;
