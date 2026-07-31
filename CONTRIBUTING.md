# Внесок у MeetBroker

## Перед pull request

```bash
npm ci
npm run lint
npm run format:check
npm run typecheck
npm test
npm run build
```

Зміни критичних API- або browser-сценаріїв додатково перевіряються через
Docker Compose:

```bash
cp .env.example .env
docker compose up -d --build --wait
npm run smoke
npm run test:e2e
docker compose down --volumes
```

## Історія комітів

Нові коміти використовують формат Conventional Commits:

```text
type(optional-scope): concise imperative description
```

Дозволені типи: `build`, `chore`, `ci`, `docs`, `feat`, `fix`, `perf`,
`refactor`, `revert`, `style`, `test`.

Приклади:

```text
feat(calendar): add localized route titles
fix(bookings): preserve attendee conflict details
docs(architecture): clarify storage adapter status
```

Не використовуємо нечіткі назви на зразок `Update`, `Format` або `Bug fix`.
Один коміт має описувати одну завершену логічну зміну. CI перевіряє всі
не-merge коміти pull request, але не переписує історичні коміти репозиторію.
