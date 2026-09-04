# Working in this repository

Context for AI assistants. Humans should read [README.md](README.md) and
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) instead — this file only states the
rules that are easy to violate without noticing.

## What this is

A static PWA that tracks habits and health indicators. Every tracked metric is
defined in the user's own Google Spreadsheet, never in the code. There is no
server. Data lives in the user's Drive and browser only.

## The three rules that matter

1. **`src/core/` imports nothing from React, the DOM, or Google.** It is pure
   domain logic and it is where the tests live. If a change to core needs a
   browser API, the change belongs somewhere else.

2. **The UI never talks to a backend directly.** It goes through the
   `HabitRepository` interface in `src/core/repository.ts`. Adding a REST backend
   must not require touching a single screen. If you find yourself importing
   `sheetsRepository` from a component, stop.

3. **Nothing personal, and no metric definitions, in the repository.**
   `src/data/starter.ts` is a neutral template. Real configuration belongs in the
   user's spreadsheet.

## Dependencies

`react` and `react-dom` are the only runtime dependencies, and that is a
deliberate feature of the project. Charts are inline SVG, the service worker is
hand-written, there is no router and no state manager. **Do not add a runtime
dependency without being asked.** A dev dependency needs a real justification too.

## Conventions

- User-visible strings in French. Code, comments, commit messages and docs in
  English.
- TypeScript strict, with `noUncheckedIndexedAccess` and `verbatimModuleSyntax`
  (so type-only imports need `import type`).
- Dates are `YYYY-MM-DD` strings in **local** time. Never build one via
  `toISOString()` — it shifts the day outside UTC. Use `src/core/date.ts`.
- `null` means "not answered" and `false` means "answered no". They are different
  in the data model and must look different on screen. Several tests exist purely
  to defend this.
- Mobile-first, ~390px. Both themes must work; use the CSS custom properties in
  `src/ui/styles.css` rather than literal colours.

## Before claiming a change works

```sh
npm run lint && npm run typecheck && npm run test && npm run build
```

`tests/screens.test.tsx` renders every screen in seven states, including empty
and error ones. It catches the crashes nobody reproduces by hand.

## Adding things

- **A field type** — `MetricType` in `src/core/types.ts`, then `parseValue` /
  `isTruthy` / `normalize` / `formatValue` in `values.ts`, then `FieldInput.tsx`.
  The switch statements are exhaustive on purpose: TypeScript will point you at
  every site that needs the new case.
- **A backend** — one file under `src/adapters/`, one branch in
  `src/lib/backend.ts`. Mirror `localRepository.ts`, which is the reference
  implementation of the contract.
- **A spreadsheet column** — `HEADERS` and the parse/serialise pair in
  `src/core/tabular.ts`, and `ensureSchema` in `src/adapters/sheets/bootstrap.ts`
  so existing sheets self-heal. Then update `docs/DATA_MODEL.md`.
