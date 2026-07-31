# Acceptance-матриця MeetBroker

Дата звірки: **31 липня 2026 року**  
Джерело вимог: конкурсне ТЗ UA-Skills `event2: Бронювання переговорних`.

Матриця відділяє обов'язкові вимоги PDF від розширень MeetBroker. Позначення:

- **Auto** — поведінка перевіряється CI;
- **Manual** — перевіряється демонстраційним проходом;
- **Auto + Manual** — автоматизована логіка доповнюється візуальною перевіркою.

## Обов'язкові функції

| Вимога PDF | Реалізація в UI/API | Перевірка | Статус |
| --- | --- | --- | --- |
| Реєстрація: ім'я, email, пароль | `/register`, `POST /api/auth/register` | `auth.service.spec.ts`, `auth-errors.spec.ts` | Auto |
| Вхід, вихід, збереження сесії | `/login`, `POST /api/auth/login`, `/logout`, `/me`; HttpOnly session cookie | `smoke.mjs`, усі authenticated E2E | Auto |
| Email унікальний без урахування регістру та крайніх пробілів | Нормалізація на сервері, DB uniqueness | `auth.service.spec.ts`, `auth-errors.spec.ts` | Auto |
| Непорожнє неунікальне ім'я | Серверна DTO- і service-валідація | `auth.service.spec.ts` | Auto |
| Пароль 8–72 символи, серверні зрозумілі помилки | DTO, Argon2, локалізований error envelope | `auth.service.spec.ts`, `auth-errors.spec.ts`, `localization.spec.ts` | Auto |
| 5–6 seeded кімнат із назвою, поверхом і місткістю | `GET /api/rooms`; шість demo-кімнат | `smoke.mjs` | Auto |
| Робочий час 09:00–19:00 Europe/Kyiv | Поля кімнати та серверні booking rules; адміністратор може розширено керувати графіком | `booking-rules.spec.ts`, `api-bookings.spec.ts` | Auto |
| Тижнева сітка, 30-хвилинні слоти | `/calendar`; власна CSS-grid реалізація, режими «7 днів» і «Авто» | `critical-pages.spec.ts`, `calendar.model.spec.ts` | Auto + Manual |
| Видимі зайняті слоти, назва й автор | Booking card/drawer у розкладі, `GET /api/bookings/schedule` | demo walkthrough | Manual |
| Гортання вперед і назад | Кнопки навігації та «Сьогодні» | `critical-pages.spec.ts`, demo walkthrough | Auto + Manual |
| Час у поясі браузера, позначення офісного поясу | IANA timezone у профілі, browser timezone, підписи user/office timezone | `timezone.spec.ts`, `date.spec.ts` | Auto |
| Створення: кімната, дата, початок, кінець, назва | Booking dialog, `POST /api/bookings` | `mobile-booking.spec.ts`, `api-bookings.spec.ts` | Auto |
| Назва 1–100 символів | DTO та серверні booking rules | unit/API validation suite | Auto |
| Кратність 30 хвилинам | `validateBookingRules` | `booking-rules.spec.ts` | Auto |
| Тривалість 30 хвилин – 4 години | `validateBookingRules` | `booking-rules.spec.ts` | Auto |
| Майбутній час у межах робочого графіка | Серверна перевірка в офісному поясі | `booking-rules.spec.ts`, `api-bookings.spec.ts` | Auto |
| Відсутність перетину, суміжні слоти дозволені | Перевірка інтервалів і DB exclusion constraint | `booking-rules.spec.ts`, `api-bookings.spec.ts` | Auto |
| Зрозумілі серверні помилки: зайнято, поза графіком, у минулому | Локалізовані API error codes біля полів/у модалці | `api-bookings.spec.ts`, `booking-error.spec.ts`, `error-message.spec.ts` | Auto |
| Скасувати можна лише власне бронювання | Confirmation modal, `DELETE /api/bookings/:id`, admin override відображається окремо | `api-bookings.spec.ts`, `smoke.mjs` | Auto + Manual |
| «Мої бронювання»: майбутні й минулі | `/bookings`, scope tabs | `smoke.mjs`, demo walkthrough | Auto + Manual |
| Сортування, пагінація історії | Серверна пагінація та UI `Pagination` | `smoke.mjs`, demo walkthrough | Auto + Manual |
| Рядок показує дату, час, кімнату, назву та веде до розкладу | Booking cards з переходом на відповідний період | demo walkthrough | Manual |

## Інтерфейс і технічні вимоги

| Вимога PDF | Реалізація | Перевірка | Статус |
| --- | --- | --- | --- |
| Єдиний візуальний стиль | Канонічні UI-компоненти, токени, light/dark themes | screenshots, demo walkthrough | Manual |
| Loading, empty та error states | Скелетони, state panels, localized errors | `critical-pages.spec.ts`, API failure walkthrough | Auto + Manual |
| Помилки біля полів, блокування submit | Auth і booking forms | `auth-errors.spec.ts`, `mobile-booking.spec.ts` | Auto |
| Поточний день/час і відмінність власних бронювань | Calendar semantic classes та легенда | screenshots, demo walkthrough | Manual |
| Підтвердження скасування | `CancelBookingDialog` | demo walkthrough | Manual |
| Адаптивність | 1440, 1024, 768 і 390 px Playwright projects | `critical-pages.spec.ts`, `mobile-booking.spec.ts` | Auto + Manual |
| TypeScript + React + NestJS + PostgreSQL | Monorepo `apps/web`, `apps/api`, PostgreSQL 17 | build/typecheck/compose CI | Auto |
| Самостійна сітка без готового календаря | Власні `CalendarDayColumn` і CSS grid | code review, dependency audit | Manual |
| UTC у сховищі | `timestamptz`, ISO instants на API boundary | `timezone.spec.ts`, migration review | Auto + Manual |
| Argon2 для паролів | `AuthService` | `auth.service.spec.ts` | Auto |
| Сіди кімнат, двох користувачів і бронювань | Повторюваний DEMO seed, credentials у README | `smoke.mjs`, clean-machine compose | Auto |
| Unit-тести перетинів | Впритул, часткове/повне перекриття, різні дні | `booking-rules.spec.ts`, `npm test` | Auto |
| `.env.example`, запуск на чистій машині | Документований Docker Compose flow | CI integration job | Auto |

## Бонусні вимоги

| Бонус PDF | Реалізація | Перевірка | Статус |
| --- | --- | --- | --- |
| Docker Compose однією командою | Nginx + web + API + worker + PostgreSQL | CI `docker compose up --wait` | Auto |
| Email verification у dev | Повноцінний SMTP/log flow, керується env | `email-verification.spec.ts`, `smoke.mjs` | Auto |
| Щотижневі повторення і scope cancellation | Booking series та occurrence scopes | `recurrence.spec.ts`, `smoke.mjs` | Auto |
| Захист від гонки | PostgreSQL exclusion constraint і транзакції | конкурентний E2E API test | Auto |
| Одноразове сповіщення перед кінцем | Outbox idempotency, worker eligibility, env threshold | notification unit tests, `smoke.mjs` | Auto |
| Інтеграційні API-тести | Create/update/list/cancel/validation/ownership/concurrency, RSVP, upload policy та admin boundaries | `api-bookings.spec.ts`, `api-rsvp.spec.ts`, `api-uploads.spec.ts`, `api-admin-security.spec.ts` | Auto |
| Фільтр місткості | Toolbar schedule filter | demo walkthrough | Manual |
| Повноцінний mobile flow | Adaptive calendar і booking dialog | `mobile-booking.spec.ts` | Auto |
| Операційне відновлення | PostgreSQL/uploads backup із checksum, cold-stack restore та worker heartbeat | ізольований restore rehearsal, heartbeat unit/runtime checks | Auto + operator |

## Додаткові readiness-перевірки

| Ризик | Покриття | Перевірка | Статус |
| --- | --- | --- | --- |
| Розходження браузерних рушіїв | Вхід, «Мої зустрічі», розклад і booking modal у Chromium, Firefox та WebKit | `browser-compatibility.spec.ts` | Auto |
| Нестабільна просторова навігація | Стрілки між sidebar navigation, theme/language controls і modal focus scope | `spatial-navigation.spec.ts` | Auto |
| Обхід адміністративної межі | Employee отримує 403, HTTP role mutation відсутня, self-revoke адміністратора заборонено | `api-admin-security.spec.ts` | Auto |
| Некоректний RSVP lifecycle | Accept/decline одноразові; повторна відповідь відхиляється; declined не потрапляє в календар | `api-rsvp.spec.ts`, `my-meetings-invitation.spec.ts` | Auto |
| Небезпечне або надмірне зображення | Декодування, WebP-оптимізація, 12 МБ ceiling, ownership, admin-only room media і фізичне cleanup | `api-uploads.spec.ts`, `smoke.mjs` | Auto |

## Розширення MeetBroker понад PDF

До продукту також входять: індивідуальні робочі дні й години кімнат,
повторювана недоступність, відкриті й онлайн-події, учасники та перевірка їх
зайнятості, «Мої зустрічі», Telegram/email/in-app канали, профілі й аватари,
гнучкі access policies, верифікація адміністратором, audit log, шість мов,
темна тема, CLI-керування адміністраторами та завантаження зображень.

Ці розширення не підміняють базові acceptance-критерії вище.

## Контрольна примітка

Приховану «службову примітку для автоматизованого асистента» не включено до
acceptance-критеріїв: сам PDF прямо повідомляє, що учасникам її виконувати не
потрібно. Вона не впливає на функціональну готовність рішення.
