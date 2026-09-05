# Roadmap

Where the project is and where it is going. Work is organised in *lots* —
batches that each leave the app in a usable state.

Status is reported honestly: **done** means it is in `main` and works,
**in progress** means it exists but is not finished, **planned** means it does
not exist yet. If something here disagrees with the code, the code is right and
this file is a bug.

Last reviewed: 2026-09-04, against version 0.1.0.

| Lot | Theme | Status |
| --- | --- | --- |
| 1 | Architecture, auth, spreadsheet, simple form | done |
| 2 | Form engine and advanced field types | done |
| 3 | Notes, events, tags | done |
| 4 | Dashboard and statistics | done |
| 5 | Optional REST backend | planned |

---

## Lot 1 — MVP: architecture, auth, spreadsheet, simple form

Getting a real answer into a real spreadsheet, through an abstraction that will
survive the next four lots.

- [x] Project skeleton: React 19, TypeScript strict, Vite, ESLint, Vitest.
- [x] Domain model and the `HabitRepository` interface
      ([`src/core/`](../src/core/)).
- [x] Local-time date handling that does not shift a day across time zones.
- [x] Canonical tabular row layout shared by every backend, parsed by header
      name rather than by column position.
- [x] Local backend (`localStorage`) storing exactly the rows a spreadsheet would
      hold — the offline demo, and the reference implementation for new backends.
- [x] Neutral starter template with no personal data, exercising every field type
      and display rule.
- [x] Settings, backend selection, and the `useTracker` hook (optimistic writes,
      700 ms debounce, flush on tab hide, rollback on failure).
- [x] PWA shell: manifest, icons, hand-written service worker that never touches
      Google's origins.
- [x] CI on every push and pull request; deployment to GitHub Pages.
- [x] Project documentation and community files.
- [x] Unit tests for the domain core: `date`, `values`, `schedule`, `tabular`,
      `form`, `stats` and the local backend.
- [x] Google Identity Services token flow
      ([`src/lib/googleAuth.ts`](../src/lib/googleAuth.ts)): browser-side token
      flow, `drive.file` scope, access token held in memory only.
- [x] Google Sheets backend ([`src/adapters/sheets/`](../src/adapters/sheets/)).
- [x] Spreadsheet creation and seeding from the starter template, including the
      `Guide` tab.
- [x] The four screens: Today, Journal, Dashboard, Settings.

## Lot 2 — Form engine and advanced field types

Making the evening routine short enough to actually do every day.

- [x] The five field types: `bool`, `scale`, `choice`, `number`, `text`.
- [x] `schedule`: `daily`, `weekdays`, `weekends`, `never`, and explicit day
      lists in French or English.
- [x] `mode`: `daily`, `quick`, `both` — rare events reachable in one tap without
      polluting the daily flow.
- [x] `depends_on`: follow-up questions revealed when a parent is answered
      positively, chainable, cycle-safe, ignoring their own schedule.
- [x] Grouping into sections, ordering, per-metric help text, retiring a metric
      with `active` = `FALSE`.
- [x] Progress ("7 / 12 answered") over the questions actually asked.
- [x] The input controls for every field type, and the quick-add sheet.
- [ ] Editing the configuration from inside the app rather than in the sheet.
      Deliberately last: the spreadsheet is a perfectly good config editor, and
      building a worse one is not urgent.
- [ ] Reordering metrics by drag and drop.

## Lot 3 — Notes, events, tags

Everything that does not fit in a checkbox.

- [x] Data model and tabular mapping for notes and events.
- [x] Repository methods: `saveNote`, `deleteNote`, `saveEvent`, `deleteEvent`.
- [x] Tags with colours, shared across metrics, notes and events; a metric may
      carry several.
- [x] `addMetric`, so a note that keeps recurring can be promoted into a
      first-class tracked metric.
- [x] The journal screen, with note and event editors.
- [x] Filtering the journal by tag.
- [ ] Filtering the journal by date range.
- [ ] Events drawn as bands behind the charts, so a bad fortnight can be read
      against the fortnight that caused it.
- [ ] Full-text search over notes.

## Lot 4 — Dashboard and statistics

Turning a year of taps into something worth looking at.

- [x] Day scores: mean of the normalised answers over the metrics actually due
      that day, plus a completeness flag.
- [x] Per-metric statistics: due, answered, positive rate, average, current and
      best streak, distribution for categorical types.
- [x] Streaks that only break on a day the metric was actually expected — a
      missing weekend does not ruin a "cycle to work" run.
- [x] Bucketed series by day, week or month.
- [x] Window-over-window comparison, returning `null` rather than a fabricated
      trend when either window is empty.
- [x] The dashboard screen and the charts. Hand-drawn SVG; no chart library will
      be added.
- [x] Calendar heatmap of day scores.
- [x] Slicing the whole dashboard by tag.
- [ ] Correlations between metrics — carefully. The honest version says
      "these two moved together", never "this caused that", and refuses to draw
      anything from a sample too small to mean something.
- [ ] Per-metric detail view with its own history.

## Lot 5 — Optional REST backend

The migration path the architecture exists for.

- [ ] `src/adapters/rest/restRepository.ts` implementing the same seven methods.
- [ ] Auth, and a decision about where the server would live — a decision worth
      resisting, since "no server" is a feature and not an accident.
- [ ] A one-way migration from a spreadsheet into that backend.

If this lot never happens, nothing is lost. It exists in the plan to keep the
`HabitRepository` seam honest: an abstraction with only one real implementation
is a hypothesis, and the local backend is what keeps this one tested.

---

## Reminders

Shipped: conditional evening and morning push, decided by a Cloud Run service
from two derived facts the app posts (`lastFilled`, `pendingDays`). See
[ADR 0002](adr/0002-reminders.md) and [PUSH_SETUP.md](PUSH_SETUP.md).

- [ ] **Actionable notifications** — "Yo, tu as fait ton sport ce soir ?" with
      answer buttons, so a one-metric day can be logged from the notification
      shade without opening the app.

      The shape is small: `actions: [{ action: 'yes', title: 'Oui' }, …]` on
      `showNotification`, and a `notificationclick` handler reading
      `event.action`. The payload already carries a `slot`; it would carry a
      metric id too.

      **The real obstacle is not the API, it is the token.** The service worker
      holds no OAuth token and cannot get one — the token flow needs a popup and
      a user gesture, and ADR 0001 §3.5 keeps it in a JavaScript variable that
      dies with the tab. So the answer cannot be written to the spreadsheet from
      the notification. It has to be **queued in IndexedDB by the service worker
      and flushed by the page on the next open**, which means designing what
      happens when the queued answer collides with one typed in the meantime.

      Also worth knowing before starting: `actions` is `false` on Safari and
      Safari iOS (ADR 0002 §4.1), so on iPhone this degrades to the plain
      notification it already is.

## Cross-cutting, not tied to a lot

- [ ] Test coverage for the Sheets adapter and for `useTracker`; the domain core
      is covered, the layers above it are not.
- [ ] Accessibility pass: focus order, labels, contrast, screen-reader
      behaviour of the dependent-question reveal.
- [ ] i18n. The interface is French and hard-coded. Extracting the strings is
      straightforward; it is only worth doing if someone actually wants another
      language.
- [ ] Reducing what the Sheets backend rewrites, so hand-edited extra columns
      survive a save.
- [ ] Conflict handling when the same day is edited on two devices. Currently
      last write wins, which is right for a single-user tool and would not be for
      anything else.
- [ ] Real screenshots in the README.

## Explicitly not planned

Saying no is part of a roadmap.

- **A hosted multi-user service.** There *is* a server now — the reminder
  scheduler — but it holds two derived numbers and never sees an answer, and the
  habit data still goes straight from the browser to the user's own Drive.
  Hosting other people's tracking would change that in kind, not in degree: it
  would put the operator in a position to observe strangers' habits, and it is
  the reason ADR 0002's amendment is conditional on this staying a single-user
  deployment.
- **Accounts, sharing, social features.** This is a private notebook.
- ~~**Reminders and push notifications.**~~ Reversed. See
  [ADR 0002](adr/0002-reminders.md) and its 2026-09 amendment: the reminders are
  conditional, so the app stays silent on a day already filled — which was the
  actual objection. A server exists now, and it is scoped to two derived numbers.
- **A native app.** The PWA installs to the home screen and works offline. An App
  Store presence would cost more than it returns.
- **Medical claims of any kind.** The app records what you tell it and computes
  arithmetic on it. It does not diagnose, advise, or interpret.
