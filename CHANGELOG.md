# Changelog

Усі помітні зміни MeetBroker фіксуються в цьому файлі. Формат спирається на
[Keep a Changelog](https://keepachangelog.com/uk/1.1.0/), а версії
дотримуються [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.2.0] — 2026-07-31

### Додано

- серверний пошук і пагінацію відкритих подій та адміністративних списків;
- операційну консоль notification outbox із контрольованим retry й аудитом;
- backup/restore PostgreSQL та uploads із checksum і cold-stack rehearsal;
- Firefox/WebKit smoke, просторову keyboard-навігацію та розширені API,
  accessibility і responsive regression сценарії;
- брендовані багатомовні Telegram-повідомлення з категоріями й емодзі.

### Змінено

- React SPA тепер збирається й віддається безпосередньо Nginx без зайвого
  runtime-контейнера `web`; DEMO і production використовують один Compose;
- `BookingsService` розділено на окремі query, creation, update,
  invitation, cancellation, attendee, image та open-event boundaries;
- адміністративні read projections, доступність кімнат і room media винесено
  з монолітного `AdminService` до предметних сервісів;
- великі Profile та CSS boundaries розкладено на менші модулі без зміни UI;
- email/Telegram стали явним opt-in, а worker отримав heartbeat, reclaim
  завислих задач і контрольований retry budget;
- пошукові й list-запити отримали індекси та захист буквальних wildcard.

### Безпека й експлуатація

- контейнери API, worker і Nginx запускаються без root, із read-only root
  filesystem, скинутими capabilities та `no-new-privileges`;
- API виконує fail-fast перевірку production env, а pre-migration guard
  блокує demo seed у production;
- Telegram webhook secret передається в офіційному HTTP-заголовку;
- auth endpoints мають окремі rate limits, uploads — узгоджений 12 МБ ліміт;
- CI перевіряє container boundaries, production guard, smoke та браузери.

### Якість

- 159 unit-тестів і 34 Playwright-сценарії;
- усі автоматизовані acceptance-посилання ведуть до наявних test-файлів;
- CodeQL, GitGuardian, Dependabot security alerts і production audit — без
  відомих проблем на момент підготовки релізу.

## [0.1.0] — 2026-07-31

### Додано

- семиденний та адаптивний календар переговорних із власною CSS-grid сіткою;
- кімнатні й онлайн-зустрічі, запрошення, відкриті події та повторення;
- перевірку перетинів кімнат і зайнятості учасників із конкурентним захистом;
- робочі дні, години й одноразову або повторювану недоступність кімнат;
- in-app, email і Telegram сповіщення через transactional outbox;
- профілі, аватари, теми та шість повних мовних каталогів;
- гнучкі capability-обмеження, схвалення користувачів і CLI адміністраторів;
- адміністративне керування кімнатами, бронюваннями та журналом аудиту;
- Docker Compose стек із PostgreSQL, API, worker, web і Nginx.

### Якість

- 112 unit-тестів і 19 Playwright-сценаріїв;
- API smoke для критичного booking, access, room і account lifecycle;
- responsive regression для 1440, 1024, 768 і 390 px;
- accessibility gate на базі axe-core та keyboard smoke;
- локалізовані route-aware назви вкладки браузера;
- CI, CodeQL, Dependabot, GitGuardian і protected `main`;
- acceptance-матриця «вимога PDF → UI/API → перевірка».

### Безпека

- Argon2 для паролів і HttpOnly session cookie;
- параметризовані SQL-запити та PostgreSQL exclusion constraint;
- email verification policy, administrator approval і session revocation;
- нуль відкритих CodeQL/Dependabot security alerts на момент релізу;
- production `npm audit` без відомих вразливостей.

[Unreleased]: https://github.com/grebocheck/MeetBroker/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/grebocheck/MeetBroker/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/grebocheck/MeetBroker/releases/tag/v0.1.0
