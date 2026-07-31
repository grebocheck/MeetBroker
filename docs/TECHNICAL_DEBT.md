# Реєстр технічного боргу

Дата останньої оцінки: **31 липня 2026 року**.

Цей список відділяє відомі точки подальшого розвитку від дефектів релізу.
Наведені модулі проходять чинні quality, smoke й browser gates; їх розмір є
ризиком супроводу, але не прихованою функціональною прогалиною.

## Залишкова локальна складність

Монолітних cross-domain сервісів понад 500 рядків більше немає. Два
command-сервіси нижче лишаються щільними, але кожен має одну предметну
відповідальність і захищений unit, integration та smoke сценаріями.

| Модуль | Поточний розмір | Наступна доречна межа |
| --- | ---: | --- |
| `BookingCreationService` | 406 рядків | Recurrence plan і persistence orchestration лише разом із новою поведінкою |
| `BookingUpdatesService` | 453 рядки | Participant delta/notification fan-out після ширшого characterization шару |

## Уже зменшені ризики

- notification copy, recurrence і booking rules є окремими чистими модулями;
- image lifecycle винесено в `BookingImagesService`;
- RSVP locking, availability check, status mutation та activity audit винесено
  в `BookingInvitationsService`;
- ownership/capability policy, admin attribution, series scope, participant
  notifications та audit скасувань винесено в
  `BookingCancellationsService`;
- створення й редагування мають окремі `BookingCreationService` та
  `BookingUpdatesService`; колишній 1642-рядковий `BookingsService` повністю
  видалено, а image endpoints напряму використовують `BookingImagesService`;
- advisory locking, participant projection і конфлікти учасників винесено в
  `BookingAttendeesService`;
- список, пошук, пагінацію та join/leave відкритих подій винесено в
  `OpenEventsService`;
- schedule, персональну історію та календарні проєкції винесено в
  `BookingQueriesService`, а спільну перевірку діапазону зведено до одного
  boundary;
- списки користувачів, бронювань і журнал аудиту винесено в
  `AdminQueriesService` зі спільною нормалізацією пагінації;
- разова й повторювана недоступність кімнат, timezone recurrence, list
  projection і scope cancellation винесені в `RoomAvailabilityService`;
- оптимізація, filesystem lifecycle та audit зображень кімнат винесені в
  `RoomMediaService`; `AdminService` більше не залежить від `sharp` і
  upload storage та зменшився до 412 рядків;
- адміністративні UI-вкладки та editor-компоненти вже мають предметні межі;
- `ProfilePage` зменшено з 712 до 28 рядків: identity, notification matrix,
  security і timezone data мають окремі компоненти/модулі;
- CSS розділено з колишнього єдиного файла на тематичні модулі;
- `foundation`, `schedule-and-overlays` та `administration` механічно
  розкладено на tokens, shell, controls, schedule, overlays, listings,
  rooms і audit/deliveries; жоден stylesheet не перевищує 900 рядків.

## Правила подальшого рефакторингу

1. Один предметний boundary на pull request.
2. Спочатку characterization або acceptance-тест, потім перенесення логіки.
3. Не змінювати API contract одночасно з механічним поділом.
4. Не створювати абстракцію без щонайменше однієї реальної відповідальності.
5. Після кожного інкременту запускати unit, smoke і релевантний Playwright.

Великий одночасний rewrite перед конкурсною демонстрацією свідомо не
проводиться: стабільна перевірена поведінка важливіша за формальне зменшення
кількості рядків.
