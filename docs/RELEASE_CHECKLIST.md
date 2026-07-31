# Release checklist

Цільова версія: **MeetBroker v0.1.0**  
Дата підготовки: **31 липня 2026 року**

## Відповідність і документація

- [x] Обов'язкові та бонусні вимоги зіставлено в `ACCEPTANCE_MATRIX.md`.
- [x] Усі згадані в матриці test-файли існують.
- [x] README містить clean start, seed, demo credentials і bonus summary.
- [x] UTC/IANA timezone та правила перетинів пояснено в README.
- [x] Rolling seven-day schedule описано як свідоме продуктове рішення.
- [x] Актуальні screenshots, технічний Markdown і DOCX присутні.
- [x] Конкурсний PDF виключено з поточного дистрибутива.
- [x] MIT, CC0, OFL і third-party notices узгоджені.

## Quality gates

- [x] ESLint і Prettier.
- [x] API/web TypeScript typecheck.
- [x] Production build.
- [x] 112 unit-тестів.
- [x] Docker Compose health і повний API smoke.
- [x] 19 Playwright-сценаріїв.
- [x] Responsive regression: 1440, 1024, 768 і 390 px.
- [x] Accessibility scan і keyboard smoke.

## Репозиторій і безпека

- [x] `main` захищено pull request і трьома required checks.
- [x] CI та CodeQL проходять на чистому GitHub runner.
- [x] CodeQL alerts: 0.
- [x] Dependabot security alerts: 0.
- [x] Production `npm audit`: 0 відомих вразливостей.
- [x] `.env`, локальний PDF, reports і codebase memory не відстежуються.
- [x] Description, topics, README screenshots і release notes підготовлено.

## Зовнішні інтеграції

- [x] Email delivery і брендований шаблон перевірялися в opt-in режимі.
- [x] Telegram linking та тестове повідомлення перевірялися вручну.
- [x] CI не надсилає повідомлення в реальні зовнішні канали.

## Публікація

- [ ] Release pull request злито в `main`.
- [ ] Фінальні CI та CodeQL зелені на release SHA.
- [ ] Створено annotated tag `v0.1.0`.
- [ ] Опубліковано GitHub Release `v0.1.0`.
