alter table users
  drop constraint users_locale_check,
  add constraint users_locale_check
    check (locale in ('uk', 'en', 'de', 'es', 'fr', 'ja'));
