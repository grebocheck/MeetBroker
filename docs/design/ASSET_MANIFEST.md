# Маніфест дизайн-концептів

Дата генерації: 2026-07-29  
Режим: вбудований `imagegen`  
Призначення: дизайн-референси та production sprite sheet аватарів

Усі перелічені тут згенеровані зображення передано під
[CC0 1.0 Universal](../../LICENSES/CC0-1.0.txt): їх можна копіювати,
змінювати й використовувати комерційно без обов'язкової атрибуції.

## Файли

| Файл | Розмір | Призначення |
|---|---:|---|
| `assets/design-concepts/kyiv-light-calendar.png` | 1586×992 | Світлий корпоративний календар |
| `assets/design-concepts/orbit-calendar.png` | 1586×992 | Контрастний технологічний календар |
| `assets/design-concepts/dobra-calendar.png` | 1568×1003 | Теплий календар із карткою профілю |
| `assets/avatar-concepts/editorial-avatar-sheet.png` | 1448×1086 | Production sprite sheet із 12 аватарами |

## Нормалізовані промпти

### Kyiv Light

> High-fidelity 16:10 desktop SaaS UI for MeetBroker. Bright calm corporate
> weekly room calendar, compact navigation, room capacity and floor, seven
> days, 09:00–19:00 grid, booking blocks, current-time line, timezone hint,
> avatar and create action. Soft white and pale blue, navy text, restrained
> blue and teal, accessible contrast. Ukrainian short labels. No gradients,
> glassmorphism, marketing layout or calendar branding.

### Orbit

> High-fidelity 16:10 desktop SaaS UI for MeetBroker. Technology-forward
> weekly calendar with midnight navigation, bright workspace, compact room
> selector, violet own bookings, cyan and slate secondary states, timezone
> indicators and avatar. Implementable React/CSS hierarchy. No neon glow,
> glassmorphism, full dark calendar or analytics dashboard.

### Dobra

> High-fidelity 16:10 MeetBroker calendar with a compact booking-details
> drawer. Warm ivory, charcoal, forest green, sage, amber and clay.
> Human-centered editorial UI, illustrated organizer avatar, concise
> Ukrainian labels and accessible contrast. Calendar remains dominant. No
> childish illustration, heavy shadows, gradients or marketing layout.

### Flowing blue avatar sheet

> Production avatar sprite sheet for a corporate meeting-room application.
> Preserve the exact 4×3 grid topology, equal tile dimensions and one
> centered head-and-shoulders portrait per tile. Completely redesign all
> twelve professionals in a polished vector-like editorial style with
> geometric shapes, diagonal cuts and subtle water-flow arcs. Use navy,
> cobalt, cyan, ice blue and small hot-pink signal accents. Keep all faces
> distinct and diverse. No text, logos, copied characters, watermarks,
> photorealism or content crossing cell boundaries.

## Обмеження використання

- текст усередині mockup-зображень може містити генеративні неточності;
- демонстраційні дати й люди не є тестовими даними продукту;
- mockup не визначає точні відступи або CSS tokens;
- аркуш аватарів використовується як sprite sheet із контрактом 4×3;
- стабільні ID `avatar-01`…`avatar-12` залежать від порядку клітинок, тому
  геометрію аркуша не можна змінювати без міграції профілів.
