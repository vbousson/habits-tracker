# Contributing

Thanks for looking. This is a small, single-maintainer project, so this document
is short and concrete: how to run it, the two architectural rules that matter,
and where to put a change of each kind.

Code, comments, commit messages and documentation are in **English**.
User-visible strings are in **French** — the app has a French-speaking audience.
That split is deliberate; please keep it.

## Setting up

You need Node 20 or later (see `.nvmrc`). Nothing else — no database, no
service, no Google account required for development.

```sh
git clone https://github.com/vbousson/habits-tracker.git
cd habits-tracker
npm ci
npm run dev
```

`npm run dev` starts Vite on <http://localhost:5173>. The app boots on the
**local backend** by default: the starter configuration is loaded into
`localStorage` and everything works offline, with no Google project and no
spreadsheet. That is the environment nearly all development happens in.

If you need to work on the Google Sheets backend specifically, follow
[docs/GOOGLE_SETUP.md](docs/GOOGLE_SETUP.md) to create your own Cloud project and
spreadsheet, then paste your client id into the app's Settings screen — you do
not need to rebuild, and you must not commit it.

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite dev server with hot reload. |
| `npm run test` | Runs the unit tests once (Vitest). |
| `npm run test:watch` | Same, in watch mode. |
| `npm run lint` | ESLint over the whole repository. |
| `npm run typecheck` | `tsc --noEmit` in strict mode. |
| `npm run build` | Typecheck, then produce `dist/`. |
| `npm run preview` | Serves the built `dist/` locally. |

CI runs `lint`, `typecheck`, `test` and `build` on every push and pull request.
Run all four before opening a PR; it is the same set, so there are no surprises.

## The rules that actually matter

Two of them. Everything else is taste, and I will not bikeshed it.

### 1. The UI never imports a backend

Screens and components talk to a `HabitRepository`
([`src/core/repository.ts`](src/core/repository.ts)) and nothing else. They do
not know whether the answer they just saved went to `localStorage`, to a Google
Sheet, or one day to a REST API.

Exactly one file is allowed to choose an implementation:
[`src/lib/backend.ts`](src/lib/backend.ts). If you find yourself writing
`import { createSheetsRepository }` anywhere under `src/ui/`, stop — the change
belongs behind the interface instead.

This is the reason a spreadsheet id, a range like `Entries!A2:D`, or an OAuth
token must never appear in a component. The moment the Google Sheet leaks into
the UI, swapping the backend stops being a one-file change and the whole design
falls over.

### 2. `src/core/` stays pure

No React, no `document`, no `window`, no `fetch`, no Google. `src/core/` is
plain TypeScript functions over plain data: types, dates, value parsing, the
schedule rules, the tabular row layout, the form engine, the statistics.

That is what makes it testable without a browser, and it is where the tests live.
New domain logic goes there with a test; a component that computes a streak
inline is a bug waiting to happen.

The corollary: formatting and colour decisions belong to the UI.
`src/core/stats.ts` returns numbers, not classes or hex codes.

## Where to put your change

### A new field type (`bool`, `scale`, `choice`, `number`, `text`, …)

Adding, say, a `duration` or a `rating` type means touching these files, in this
order:

1. [`src/core/types.ts`](src/core/types.ts) — add the literal to `MetricType`,
   and to `MetricValue` if it needs a representation the existing union cannot
   express.
2. [`src/core/values.ts`](src/core/values.ts) — `parseValue`, `serializeValue`,
   `isTruthy`, `normalize` and `formatValue`. All five are exhaustive `switch`es
   over the type; `noFallthroughCasesInSwitch` and strict mode will point you at
   every one you missed. Think hard about `isTruthy` (does a value of this type
   reveal a `depends_on` child?) and `normalize` (does it have a meaningful
   0..1 projection, or should it return `null` like `choice` and `text` do?).
3. [`src/core/tabular.ts`](src/core/tabular.ts) — add the string to
   `METRIC_TYPES` so a `Config` row naming it parses instead of silently
   degrading to `bool`.
4. `src/ui/` — the input control that renders it in the form.
5. `tests/` — the parse/serialise round-trip and the truthiness behaviour.
6. [`docs/DATA_MODEL.md`](docs/DATA_MODEL.md) — the `type` column table. A field
   type that is not documented there does not exist, as far as users are
   concerned.

### A new storage backend

The interface is seven methods: `load`, `saveDay`, `saveNote`, `deleteNote`,
`saveEvent`, `deleteEvent`, `addMetric`. To add one:

1. Create `src/adapters/<name>/<name>Repository.ts` exporting a
   `create<Name>Repository(options): HabitRepository` factory. Follow
   [`src/adapters/local/localRepository.ts`](src/adapters/local/localRepository.ts)
   as the reference implementation — it is the smallest complete one.
2. If your backend stores rows in a table (a CSV, a spreadsheet, an SQL table),
   **reuse `src/core/tabular.ts`** rather than writing your own mapping. Two
   backends that parse the same format two different ways will drift, and the
   bug will surface in the one you test least.
3. Add the kind to `RepositoryKind` in
   [`src/core/repository.ts`](src/core/repository.ts).
4. Add one branch to `createRepository` in
   [`src/lib/backend.ts`](src/lib/backend.ts), and whatever settings it needs to
   [`src/lib/settings.ts`](src/lib/settings.ts).
5. Extend the backend picker in `src/ui/screens/SettingsScreen.tsx`.

Nothing under `src/core/` and no other screen should need to change. If yours
does, that is a signal the abstraction is leaking — say so in the PR.

### A change to the spreadsheet layout

`src/core/tabular.ts` is the single source of truth for column names and row
shapes; `docs/DATA_MODEL.md` documents it. Change both, in the same commit.
Remember that existing users have real spreadsheets: parsing is driven by header
*names*, not positions, and a missing optional column must keep loading. Do not
break someone's data to save yourself an `if`.

## Commits and pull requests

Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(form): reveal depends_on children on scale answers above the first level
fix(sheets): keep the sheet readable when a scale level is renamed
docs(readme): document the quick-add mode
refactor(core): extract bucketStart from bucketSeries
test(schedule): cover French day aliases
chore(deps): bump vite to 7.1.4
ci: run the build on pull requests too
```

Common types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `ci`, `perf`.
The scope is optional and is usually a folder (`core`, `sheets`, `ui`, `pwa`).

For the pull request itself:

- One concern per PR. A refactor bundled with a feature is twice as hard to
  review and half as likely to be merged.
- Fill in the checklist in the template. It mirrors the rules above.
- Say what you deliberately did *not* do — that is often the most useful line in
  the description.
- Add a `## [Unreleased]` entry to `CHANGELOG.md` if a user would notice the
  change.

**No new npm dependencies**, please, unless you can show the alternative is
genuinely worse. The project ships React and nothing else on purpose: no chart
library, no UI kit, no router, no Google SDK. That constraint is a feature — it
is why the bundle is small, the build is fast and the supply chain is short. A
PR that adds a dependency needs to argue for it in the description.

## Review latency, honestly

I maintain this in evenings and weekends, around a full-time job. Realistically:

- A first reply within a week or two. Sometimes the same day, sometimes not.
- Small, focused, tested PRs get merged fastest — often immediately.
- Large or architectural changes: **please open an issue first.** I would rather
  discuss a design for ten minutes than decline three days of your work, and I
  will decline changes that break the two rules above however good the code is.
- If a PR goes quiet for a month, ping it. That is a dropped ball, not a verdict.
- Feature requests may be declined for scope. This is a tool that has to stay
  small enough for one person to maintain; "no" to a good idea is usually about
  that, not about the idea.

## Reporting things

- **Bugs and features**: use the
  [issue templates](https://github.com/vbousson/habits-tracker/issues/new/choose).
  Please do not paste personal health data into a public issue — a metric id and
  a field type are almost always enough.
- **Security**: privately, never as an issue. See [SECURITY.md](SECURITY.md),
  which also explains why the public OAuth client id is not a leaked secret.
- **Behaviour**: this project follows the
  [Contributor Covenant](CODE_OF_CONDUCT.md).

By contributing, you agree that your contributions are licensed under the
[MIT License](LICENSE).
