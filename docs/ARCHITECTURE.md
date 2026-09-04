# Architecture

A static React app with no server, no router, no state library and no SDK. The
whole design turns on one decision — a storage interface between the UI and
wherever the data actually lives — and this document explains that decision, the
layers around it, and how to extend either side of it.

## The shape of the thing

```
┌─────────────────────────────────────────────────────────────────┐
│  src/ui/            screens and components                      │
│                     React, French strings, all the formatting   │
└───────────────┬─────────────────────────────────────────────────┘
                │  reads a Snapshot, calls setValue / saveNote / …
┌───────────────▼─────────────────────────────────────────────────┐
│  src/lib/           useTracker  — owns the snapshot, debounces   │
│                     backend.ts  — picks the implementation       │
│                     settings.ts — device preferences             │
│                     googleAuth  — the GIS token flow             │
└───────────────┬─────────────────────────────────────────────────┘
                │  HabitRepository  ◄── the seam
        ┌───────┴────────┬─────────────────────┐
┌───────▼──────┐ ┌───────▼───────┐ ┌───────────▼───────────┐
│ adapters/    │ │ adapters/     │ │ adapters/rest/        │
│   local      │ │   sheets      │ │   (not written yet)   │
│ localStorage │ │ Google Sheets │ │                       │
└───────┬──────┘ └───────┬───────┘ └───────────┬───────────┘
        └────────────────┴─────────────────────┘
                         │  both speak the same row format
┌────────────────────────▼────────────────────────────────────────┐
│  src/core/          types · date · values · schedule            │
│                     tabular · form · stats · repository          │
│                     no React, no DOM, no fetch, no Google        │
└─────────────────────────────────────────────────────────────────┘
```

Dependencies point downwards only. `core` imports nothing from the layers above
it; `ui` imports nothing from `adapters`.

## `src/core/` — the domain

Plain TypeScript over plain data. It knows what a metric is, when a question is
due, how to read a cell, and how to turn a year of answers into a streak. It does
not know that any of this ends up on a screen or in a spreadsheet.

| File | Responsibility |
| --- | --- |
| [`types.ts`](../src/core/types.ts) | The vocabulary: `Metric`, `Tag`, `Entry`, `Note`, `TrackedEvent`, `Snapshot`. |
| [`date.ts`](../src/core/date.ts) | `YYYY-MM-DD` arithmetic in **local** time, plus the French labels. |
| [`values.ts`](../src/core/values.ts) | The only bridge between cells (strings) and values. Parse, serialise, `isTruthy`, `normalize`, `formatValue`. |
| [`schedule.ts`](../src/core/schedule.ts) | Parses the `schedule` cell and answers "is this metric due on that day?". |
| [`tabular.ts`](../src/core/tabular.ts) | The canonical row layout: tab names, header names, row ↔ object mapping. |
| [`form.ts`](../src/core/form.ts) | The form engine: which questions to ask today, in which sections, at which indent. |
| [`stats.ts`](../src/core/stats.ts) | Day scores, per-metric rates and streaks, bucketed series, window comparison. |
| [`colors.ts`](../src/core/colors.ts) | The one presentation-shaped file here: it maps a tag or a heatmap level onto a CSS colour built from the design tokens. See the note below. |
| [`repository.ts`](../src/core/repository.ts) | The `HabitRepository` interface, plus the helpers every backend shares. |

Two properties are worth defending in review.

**Purity.** No React, no `document`, no `fetch`. That is what lets the tests run
in milliseconds without a browser, and it is why the same logic can be reused by
a future export script or a CLI.

**No presentation decisions.** `stats.ts` returns `0.73`, never `"73 %"` and
never a colour.

Two files bend that rule deliberately, and it is worth knowing why.
`date.ts` holds French day and month labels, because date formatting is
genuinely domain-shaped and `Intl` would drag locale data into every call site.
`colors.ts` maps a tag or a heatmap level onto a CSS colour — but it does so by
composing the design tokens (`var(--accent)`, blends over `var(--surface-2)`),
never by reading a computed style and never by hard-coding a hex value that the
user did not supply. It stays pure and testable, and the theme keeps working
because the tokens do the work.

### Two subtleties that bite

*Dates never go through `Date.toISOString()`.* That method formats in UTC, so for
anyone east or west of Greenwich it silently shifts the day — an entry made at
23:30 in Paris would land on the wrong date. `toISODate` formats from the local
getters instead.

*`null` and `false` are different.* `null` means "not answered"; `false` means
"answered no". A tracker that cannot tell those apart cannot compute an honest
completion rate, so nothing in the code is allowed to conflate them.

## `HabitRepository` — the seam

```ts
interface HabitRepository {
  readonly kind: RepositoryKind      // 'local' | 'sheets'
  readonly label: string             // shown in the UI: "Cet appareil"

  load(): Promise<Snapshot>          // config + entries + notes + events

  saveDay(date: ISODate, entries: Entry[]): Promise<void>
  saveNote(note: Note): Promise<void>
  deleteNote(id: string): Promise<void>
  saveEvent(event: TrackedEvent): Promise<void>
  deleteEvent(id: string): Promise<void>
  addMetric(metric: Metric): Promise<void>
}
```

Seven methods. That is the entire contract between the app and its storage.

### Why it exists

Because the Google Sheet is an implementation detail, and detail that leaks is
detail you can never change.

Without this interface, a spreadsheet id would appear in a settings screen, a
range like `Entries!A2:D` in a save handler, an access token in a component, and
a retry-on-401 in a `useEffect`. Every one of those is a thread tying a screen to
Google. Cut enough of them and swapping the backend stops being a design choice
and becomes a rewrite.

With it, the entire UI is written against seven methods that say nothing about
where the bytes go. Concretely, this buys:

- **A demo that costs nothing.** The public deployment runs the `local` backend:
  a visitor gets the real app, with the real form engine and the real statistics,
  without a Google account. It is not a mock — it is the same code path.
- **Tests without a network.** The local backend *is* the test double.
- **A migration path.** [The roadmap](ROADMAP.md) ends with an optional REST
  backend. That is one new file and one new branch in `src/lib/backend.ts`, and
  nothing else in the app changes. It is the difference between "someday" and
  "an afternoon".
- **A reviewable rule.** "Does this import a backend from the UI?" is a question
  anyone can answer by looking, which is what makes the constraint survive
  contact with a tired maintainer at 23:00.

### `load()` returns everything at once

One round trip, deliberately. A remote backend is billed and rate-limited per
request, and a form that fetched per metric would be unusable on a train. The
whole snapshot is small — a few thousand rows is a few hundred kilobytes — so the
app holds it in memory and writes incrementally.

### Shared helpers, not shared code paths

`repository.ts` also exports the pieces every backend needs, so they cannot drift:

- `typeEntries(raw, metrics)` — backends read cells as strings; this applies the
  per-metric typing once the config is known, and drops entries whose metric no
  longer exists (which is what makes deleting a `Config` row safe).
- `indexEntries(entries)` — `date → metricId → entry`, with later rows winning,
  so an append-only correction overrides the original.
- `answersFor(entries, date)` — one day's answers, which is what the form engine
  consumes.

Likewise, any backend that stores rows in a table reuses
[`tabular.ts`](../src/core/tabular.ts) rather than writing its own mapping. The
local backend keeps *literally the same rows* a spreadsheet would hold — that
symmetry means a bug in the tabular mapping shows up in the offline demo instead
of in someone's real data.

## `src/lib/` — the wiring

| File | Responsibility |
| --- | --- |
| [`backend.ts`](../src/lib/backend.ts) | The **only** file that chooses an implementation. One `if`, and a fallback to `local`. |
| [`settings.ts`](../src/lib/settings.ts) | Device preferences in `localStorage`: backend choice, spreadsheet id, client id, theme. |
| [`googleAuth.ts`](../src/lib/googleAuth.ts) | The Google Identity Services token flow. The access token lives in memory only. |
| [`useTracker.ts`](../src/lib/useTracker.ts) | Owns the snapshot and every write. |

`createRepository` falls back to the local backend whenever the Sheets backend is
not fully configured. There is no error state for "you have not set this up yet" —
you simply get the demo, which is a better first experience than a modal.

### `useTracker`, in one paragraph

It loads a snapshot on mount, exposes it, and takes writes. Answers are applied
to local state immediately and persisted on a **700 ms debounce**, because the
evening form must never make you wait on a network call and a burst of taps
should cost one request, not eight. Notes, events and metric additions are
written optimistically and **rolled back** if the backend rejects them. Days that
failed to save go back into the pending set so the next attempt resends them.
A `visibilitychange` listener flushes when the tab is hidden, so closing the PWA
mid-form does not lose the last few taps.

## `src/ui/` — the screens

Four screens (Today, Journal, Dashboard, Settings), a shared `ScreenProps` giving
each of them the same `TrackerApi` handle, and no router — the app is a
bottom-tab shell and a piece of state.

The UI owns everything the core refuses to: French copy, colours, chart drawing
(hand-rolled SVG, no chart library), the theme, and the layout. It reads a
`Snapshot`, calls the `TrackerApi`, and never mentions Google.

## Data flow: one answer, end to end

Following a single tap through the whole stack is the fastest way to understand
the design. You answer "Crise d'urticaire → Oui".

1. **The form asked the question.** On render, the screen called
   `buildDailyForm(config, date, answers)` from `core/form.ts`, which walked the
   metrics and kept the ones that are `active`, not `quick`-only, due today per
   `isDueOn`, and — for a row with `depends_on` — whose parent is answered
   positively. It grouped them into sections and gave each a `depth`. (For a
   `quick` metric like this one, `buildQuickForm` did the same job for the
   quick-add sheet.)
2. **The tap calls `setValue(date, 'crise_urticaire', true)`** on the
   `TrackerApi`.
3. **`useTracker` updates the snapshot immediately** — replacing any existing
   entry for that (date, metric) pair, stamping `updatedAt` — and re-renders.
   The UI is already correct; nothing has been saved yet.
4. **The follow-ups appear.** The next render re-runs the form builder with the
   new answers. `isTruthy` says `true` is positive, so `urticaire_intensite` and
   `urticaire_cause` become visible, indented one level. No component knows this
   rule; the engine does.
5. **The day is queued and a 700 ms timer starts.** More taps reset it. Nothing
   goes over the network mid-burst.
6. **`flush()` fires** and calls `repo.saveDay(date, entriesForThatDay)`.
7. **The adapter maps and writes.** `entryToRow` from `tabular.ts` turns each
   entry into `[date, metric_id, value, updated_at]`, with `serializeValue`
   rendering `true` as `TRUE`. The local backend drops the day's superseded rows
   and appends; the Sheets backend upserts the same rows in `Entries`.
8. **On success**, `lastSavedAt` updates and the UI shows "Enregistré". **On
   failure**, the day goes back into the pending set and the error surfaces —
   nothing is lost, and the next tap or an explicit retry resends it.
9. **On the next `load()`**, `parseEntries` reads the rows back as strings and
   `typeEntries` types them against the config, so `TRUE` becomes `true` again
   and an entry whose metric has since been deleted is dropped.

The screen in step 2 has no idea whether step 7 wrote to `localStorage` or to
Google. That is the whole point.

## How to add a new backend

The reference implementation is
[`src/adapters/local/localRepository.ts`](../src/adapters/local/localRepository.ts):
it is complete, it is about 120 lines, and it exercises every method.

1. **Write the adapter.** `src/adapters/<name>/<name>Repository.ts`, exporting
   `create<Name>Repository(options): HabitRepository`. Take everything it needs —
   a base URL, a token getter — as parameters. It must not read settings or touch
   the DOM itself.
2. **Reuse `core/tabular.ts`** if your store is row-shaped. Two backends parsing
   the same format two different ways will drift, and the bug will surface in
   whichever one you test least.
3. **Type your entries on the way out.** Call `typeEntries(rawEntries, metrics)`
   in `load()`, exactly as the local adapter does, so the rest of the app
   receives typed values rather than strings.
4. **Register the kind** in `RepositoryKind`
   ([`src/core/repository.ts`](../src/core/repository.ts)).
5. **Add one branch** to `createRepository`
   ([`src/lib/backend.ts`](../src/lib/backend.ts)) and whatever fields it needs
   to `Settings` ([`src/lib/settings.ts`](../src/lib/settings.ts)).
6. **Extend the backend picker** in `src/ui/screens/SettingsScreen.tsx`.

Steps 1–3 are the work. Steps 4–6 are three small diffs. Nothing under
`src/core/` and no other screen should need to change; if yours does, the
abstraction is leaking and that is worth discussing in the pull request.

## How to add a new field type

Say you want `duration`, or a `rating` rendered as stars.

1. **[`src/core/types.ts`](../src/core/types.ts)** — add the literal to
   `MetricType`. Extend `MetricValue` only if the existing
   `boolean | number | string | null` union genuinely cannot represent it.
2. **[`src/core/values.ts`](../src/core/values.ts)** — the five exhaustive
   `switch`es: `parseValue`, `serializeValue`, `isTruthy`, `normalize`,
   `formatValue`. `noFallthroughCasesInSwitch` and strict mode will point at
   every one you forget. The two that need thought:
   - `isTruthy` — does a value of this type reveal a `depends_on` child? Look at
     how `scale` treats its first level as falsy before deciding.
   - `normalize` — does it have a meaningful 0..1 projection? If not, return
     `null` like `choice` and `text` do, and it will be excluded from averages
     instead of silently distorting them.
3. **[`src/core/tabular.ts`](../src/core/tabular.ts)** — add the string to
   `METRIC_TYPES`, or a `Config` row naming it will parse as `bool`.
4. **`src/ui/`** — the input control. This is the only React you write.
5. **`tests/`** — the parse/serialise round trip, and the truthiness behaviour.
   Both are pure functions; the test is five lines.
6. **[`docs/DATA_MODEL.md`](DATA_MODEL.md)** — the `type` table. A field type
   that is not documented there does not exist as far as users are concerned.

Notice what is *not* on the list: the form engine, the statistics, the adapters.
They are written against the type system, not against a list of types, so they
pick up a new one for free.

## The PWA shell

[`public/sw.js`](../public/sw.js) is hand-written — around 100 lines, no Workbox,
no build plugin. Navigations are network-first so a deploy is picked up on the
next load; Vite's fingerprinted `assets/*` are cache-first because their contents
can never change; old caches are dropped on activate.

It **never touches `googleapis.com` or `accounts.google.com`**. Caching an
authenticated API response would show stale data, a cached write response would
make a failed save look successful, and intercepting the token flow breaks
sign-in outright. The bypass is explicit and commented, and a regression there is
a security bug, not a performance one.

## Things deliberately not here

- **No router.** Four screens and a tab bar. A router would add a dependency, a
  bundle, and a class of GitHub Pages deep-link bugs, to replace one `useState`.
- **No chart library.** The charts are hand-drawn SVG. `stats.ts` already returns
  exactly the numbers they need.
- **No state management library.** One hook owns one snapshot.
- **No Google SDK.** The Sheets REST API is `fetch` with a bearer token, and
  Google Identity Services is a single script tag.
- **No server, ever.** It is what makes the privacy claim in the
  [README](../README.md) true by construction rather than by promise: there is
  no machine of ours for the data to pass through.
