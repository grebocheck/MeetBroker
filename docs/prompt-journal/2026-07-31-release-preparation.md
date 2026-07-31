# Підготовка першого публічного релізу

## Запит 097 — метадані, Dependabot і реліз `v0.1.0`

> Підготувати description і topics репозиторію, пояснити в README
> семиденну інтерпретацію розкладу, упорядкувати сім Dependabot PR та
> підготувати перший GitHub Release.

### Рішення щодо продукту

- GitHub description стисло описує MeetBroker як Persona-inspired платформу
  бронювання кімнат із rolling schedule, онлайн-зустрічами, сповіщеннями,
  гнучким доступом і Docker-first TypeScript stack;
- topics охоплюють предметну область, стек і ключові якості:
  `meeting-room-booking`, `room-booking`, `scheduling`, `calendar`,
  `nestjs`, `react`, `typescript`, `postgresql`, `drizzle-orm`,
  `docker-compose`, `telegram-bot`, `i18n`, `accessibility`,
  `open-source`;
- README явно фіксує єдиний помітний ризик інтерпретації PDF: MeetBroker
  показує поточну дату та наступні шість днів, а не календарний тиждень
  понеділок–неділя;
- режим «Авто» змінює кількість одночасно видимих колонок відповідно до
  ширини екрана, але не змінює семиденний часовий діапазон.

### Релізна документація

- додано changelog із повним складом `v0.1.0`;
- створено відтворюваний release checklist із quality, security,
  documentation та integration gates;
- технічний борг задокументовано окремо: великі `BookingsService`,
  `AdminService`, `ProfilePage` і CSS-модулі потребують поступового поділу,
  але ризиковий великий рефакторинг перед конкурсною здачею свідомо не
  виконується;
- release documentation злито через PR #9 після успішних required checks.

### Рішення щодо Dependabot

- PR #6 із TypeScript 7 закрито як `deferred-major`: він реально ламає
  typecheck через несумісні `moduleResolution=node10` і `baseUrl`;
- Docker PR #2 і #3 із Node 25 закрито як `deferred-major`; канонічним
  runtime для цього релізу залишається Node 24;
- PR #1, #5 і #7 із зеленими GitHub Actions об'єднано в один CI-only PR
  #10, щоб атомарно оновити `actions/setup-node` та обидві CodeQL action;
- PR #10 пройшов typecheck, tests/build, API/browser regression, CodeQL і
  GitGuardian та був злитий окремо від runtime-залежностей;
- вихідні PR #1, #5 і #7 закрито з міткою `superseded`;
- production PR #4 залишено відкритим із міткою `deferred`: перед релізом
  немає підстав поспішати, бо production `npm audit`, CodeQL і Dependabot
  security alerts не містять відомих проблем;
- Dependabot налаштовано не створювати нові major PR для TypeScript,
  пов'язаних Vite/type packages і Node Docker images до свідомої міграції.

### Пов'язані pull requests і коміти

- PR #9 — `docs(release): prepare v0.1.0 publication`;
- `63899ae` — changelog, checklist, technical debt і README-рішення;
- `f26e1e6` — політика відкладених major updates;
- PR #10 — `ci(actions): refresh setup and analysis actions`;
- `1c9a128` — актуальні pinned revisions GitHub Actions.

### Публікація

- PR #11 із цим журналом пройшов усі required checks і був злитий;
- post-merge CI та CodeQL успішно перевірили release SHA `2ad79cf`;
- на перевіреному SHA створено annotated tag `v0.1.0`;
- GitHub Release `MeetBroker v0.1.0` опубліковано як latest release:
  <https://github.com/grebocheck/MeetBroker/releases/tag/v0.1.0>.
