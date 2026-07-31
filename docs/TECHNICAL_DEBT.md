# Реєстр технічного боргу

Дата останньої оцінки: **31 липня 2026 року**.

Цей список відділяє відомі точки подальшого розвитку від дефектів релізу.
Наведені модулі проходять чинні quality, smoke й browser gates; їх розмір є
ризиком супроводу, але не прихованою функціональною прогалиною.

## Зафіксовані hotspots

| Модуль | Поточний розмір | Наступна доречна межа |
| --- | ---: | --- |
| `BookingsService` | 1090 рядків | Окремі create/update/cancel command services |
| `AdminService` | 1276 рядків | Поділ command orchestration і read projections |
| `schedule-and-overlays.css` | 1631 рядок | Calendar grid, drawer і modal sections |
| `foundation.css` | 1523 рядки | Tokens/base, shell та canonical controls |
| `administration.css` | 1188 рядків | Users, bookings, rooms та audit surfaces |
| `ProfilePage` | 712 рядків | Identity, integrations і security cards |

## Уже зменшені ризики

- notification copy, recurrence і booking rules є окремими чистими модулями;
- image lifecycle винесено в `BookingImagesService`;
- advisory locking, participant projection і конфлікти учасників винесено в
  `BookingAttendeesService`;
- список, пошук, пагінацію та join/leave відкритих подій винесено в
  `OpenEventsService`;
- schedule, персональну історію та календарні проєкції винесено в
  `BookingQueriesService`, а спільну перевірку діапазону зведено до одного
  boundary;
- адміністративні UI-вкладки та editor-компоненти вже мають предметні межі;
- CSS розділено з колишнього єдиного файла на тематичні модулі.

## Правила подальшого рефакторингу

1. Один предметний boundary на pull request.
2. Спочатку characterization або acceptance-тест, потім перенесення логіки.
3. Не змінювати API contract одночасно з механічним поділом.
4. Не створювати абстракцію без щонайменше однієї реальної відповідальності.
5. Після кожного інкременту запускати unit, smoke і релевантний Playwright.

Великий одночасний rewrite перед конкурсною демонстрацією свідомо не
проводиться: стабільна перевірена поведінка важливіша за формальне зменшення
кількості рядків.
