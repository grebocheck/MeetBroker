# MeetBroker

Корпоративний застосунок для бронювання переговорних кімнат. MVP уже
запускається як контейнеризований стек і придатний до наскрізного тестування.

## Швидкий запуск

Потрібні Docker із Compose plugin. З кореня репозиторію:

```bash
cp .env.example .env
docker compose up -d --build
npm run smoke
```

Застосунок: [http://localhost:8080](http://localhost:8080)

Демонстраційні облікові записи:

| Рівень | Email | Пароль |
| --- | --- | --- |
| Адміністратор | `admin@meetbroker.local` | `Admin123!` |
| Користувач | `user@meetbroker.local` | `User12345!` |
| Користувач | `anna@meetbroker.local` | `User12345!` |

Міграції застосовуються контейнером `migrate` через `node-pg-migrate`.
Демонстраційні дані створюються лише з `SEED_DEMO_DATA=true`, яке вже
вказане у `.env.example`; у production цю змінну потрібно вимкнути.
Повторний запуск є безпечним. Для реальної інсталяції також потрібно змінити
паролі БД, webhook secret і не використовувати демонстраційні облікові дані.

Корисні команди для схеми:

```bash
npm run db:migrate
npm run db:migrate:status
npm run db:migrate:create -- add_room_equipment
```

Локальні команди очікують `DATABASE_URL`. Для бази всередині Compose status
можна виконати так:

```bash
docker compose run --rm migrate \
  npm run db:migrate:status:prod --workspace @meetbroker/api
```

## Що входить до MVP

- тижневий календар кімнат і захищене від перетинів бронювання;
- запрошення, відповіді учасників і відкриті заходи;
- профілі, власні фото та готові аватари;
- верифікація, схвалення адміністратором і тимчасові capability-обмеження;
- робочі години, технічні блокування, каталог бронювань і примусове
  скасування адміністратором з аудитом;
- адміністративне редагування чужих бронювань із причиною, атрибуцією в
  сповіщеннях і пошуковим журналом ключових подій;
- адміністративний override недоступності кімнати з обов'язковою причиною;
- центр сповіщень, email і Telegram через transactional outbox;
- матриця налаштувань «група сповіщень × канал» і розширюваний контракт
  `NotificationChannel`;
- адаптивний інтерфейс, світла/темна тема та фундамент i18n;
- окремі контейнери PostgreSQL, API, worker, web і Nginx.

## Перевірки

```bash
npm run typecheck
npm test
npm run build
npm run smoke
```

`smoke` очікує запущений стек на `http://localhost:8080` і перевіряє UI,
health, вхід, кімнати, створення/скасування бронювання, відкриті події,
матрицю сповіщень та адміністрування.

## Документація

- [Конкурсне технічне завдання](spec-uk.pdf)
- [План розробки](docs/PROJECT_PLAN.md)
- [Продуктова модель доступу та профілів](docs/decisions/0001-product-access-and-profiles.md)
- [Запрошення, сповіщення та доступність кімнат](docs/decisions/0002-invitations-notifications-and-room-availability.md)
- [Дизайн, локалізація та теми](docs/decisions/0003-design-localization-and-theming.md)
- [Карта екранів](docs/design/SCREEN_MAP.md)
- [Візуальні напрями](docs/design/DESIGN_DIRECTIONS.md)
- [Канонічні UI-компоненти](docs/design/UI_COMPONENTS.md)
- [Маніфест дизайн-концептів](docs/design/ASSET_MANIFEST.md)
- [Журнал промптів](docs/prompt-journal/README.md)
