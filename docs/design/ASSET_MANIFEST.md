# Маніфест дизайн-концептів

Дата генерації: 2026-07-29  
Режим: вбудований `imagegen`  
Призначення: референси для вибору, не production-ready assets

## Файли

| Файл | Розмір | Призначення |
|---|---:|---|
| `assets/design-concepts/kyiv-light-calendar.png` | 1586×992 | Світлий корпоративний календар |
| `assets/design-concepts/orbit-calendar.png` | 1586×992 | Контрастний технологічний календар |
| `assets/design-concepts/dobra-calendar.png` | 1568×1003 | Теплий календар із карткою профілю |
| `assets/avatar-concepts/editorial-avatar-sheet.png` | 1448×1086 | Стилістичний аркуш із 12 аватарами |

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

### Editorial avatar sheet

> Cohesive 4×3 sheet of twelve diverse adult professional illustrated
> avatars. Refined flat editorial style, consistent head-and-shoulders crop,
> readable at 48px, varied faces and several identity-neutral characters.
> Forest green, Kyiv blue, teal, amber, coral, plum and warm neutrals. No
> text, logos, photorealism, stereotypes, gradients or repeated faces.

## Обмеження використання

- текст усередині mockup-зображень може містити генеративні неточності;
- демонстраційні дати й люди не є тестовими даними продукту;
- mockup не визначає точні відступи або CSS tokens;
- аркуш аватарів не використовується як sprite sheet;
- перед production-використанням аватари мають бути окремими оптимізованими
  файлами з підтвердженими правами та стабільними ID.

