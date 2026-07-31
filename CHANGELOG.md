# Changelog

Усі помітні зміни MeetBroker фіксуються в цьому файлі. Формат спирається на
[Keep a Changelog](https://keepachangelog.com/uk/1.1.0/), а версії
дотримуються [Semantic Versioning](https://semver.org/).

## [Unreleased]

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

[Unreleased]: https://github.com/grebocheck/MeetBroker/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/grebocheck/MeetBroker/releases/tag/v0.1.0
