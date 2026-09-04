# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Because the app is a static site, "releasing" means tagging a commit; users
always run whatever the deployment currently serves. The versions below exist so
that bug reports can name something precise.

## [Unreleased]

### Added

- **Goals.** A target placed on one or more metrics over a period — "cycle to
  work at least twice a week", "snack at most two evenings" — evaluated per day,
  week, month or rolling window, with an `only_when` clause so a goal is judged
  only on the days it applies to. Goals live in a new `Goals` tab and are
  editable in the app. Raising a target **closes the old goal and opens a new
  one** rather than editing in place, so the history of what the bar used to be
  stays truthful.
- **Per-option colours.** A `colors` column on `Config` tints the answer buttons
  of a graded question, low to high. Colour is never the only signal: the chosen
  option also carries a check glyph, heavier weight and an inset ring.
- **Fill-time measurement.** An `auto` metric mode, for values the app writes
  itself; the shipped `duree_saisie` metric records how long a day takes to fill
  in, so the evening routine can be measured and shortened.
- **A catch-up banner** listing the days still owed an answer, each a tap away.
- **Calendar reminders.** Settings generates an `.ics` with two daily events at
  configurable times. This is the only reminder mechanism that works on every
  platform without a server; see `docs/adr/0002-reminders.md` for why, and for
  what it cannot do.
- Documentation: `docs/INSTALLATION.md` (French setup runbook),
  `docs/BRANDING.md`, `docs/MARKET.md`, and two ADRs on the data backend and on
  reminders.

### Changed

- **New palette.** The previous one failed WCAG AA in six places — borders at
  1.35:1, six of seven tag colours below the threshold, the dark-theme "Oui"
  label at 2.38:1. All 46 contrast pairs now pass, and the seven tag colours are
  distinguishable under simulated protanopia and deuteranopia.
- **The journal is one timeline.** Notes and events are interleaved
  chronologically instead of living in two separate sections, and the day screen
  now shows and can add the notes and events attached to the day being viewed.
- **Quick add always offers a choice** of what to record, filtered by tag when
  there are enough entries, and no longer asks for a date: it writes to today.
  Backfilling stays where it belongs, on the day screen.
- **Writes to Google Sheets are incremental.** A save used to rewrite the whole
  `Entries` tab — about 0.9 MB after a year of history, several times an evening
  on a mobile connection. Only the difference is appended now, with a
  cleared answer recorded as an empty-value tombstone, so a save is a couple of
  kilobytes whatever the history's size. A save that changes nothing sends no
  request at all.
- A new icon and a shorter page title.

### Removed

- **The printable and CSV doctor export.** It came from an example in the
  original design document rather than from a real need. The data behind it — a
  tagged, dated chronology of events with intensity and cause — is untouched, so
  it can come back if it is ever actually wanted. `listOccurrences` went with it.
- GitLab Pages support. GitHub Pages is the only deployment target.


## [0.1.0] — 2026-09-04

First public version: the four screens, both backends, and the domain layer that
holds them up. See [docs/ROADMAP.md](docs/ROADMAP.md) for what is done and what is
planned.

### Added

- **Domain core** (`src/core/`), free of React, of the DOM and of Google:
  - the type model — metrics, tags, entries, notes, events, snapshots;
  - local-time `YYYY-MM-DD` date handling that does not shift a day across
    time zones;
  - value parsing, normalisation and formatting for the five field types
    (`bool`, `scale`, `choice`, `number`, `text`), accepting French and English
    spellings of yes/no;
  - the schedule rules — `daily`, `weekdays`, `weekends`, `never` and explicit
    day lists in French or English (`lun,mer,ven`);
  - the canonical tabular row layout shared by every backend, parsed by header
    name so users can reorder columns in their own spreadsheet;
  - the form engine, including `depends_on` follow-up questions and the
    `daily` / `quick` / `both` display modes;
  - the statistics — day scores, per-metric rates, streaks, bucketed series and
    window-over-window comparison.
- **`HabitRepository`**, the single storage interface the whole UI is written
  against (`src/core/repository.ts`).
- **Local backend** (`src/adapters/local/`) storing the exact rows a spreadsheet
  would hold, in `localStorage`. Powers the offline demo.
- **Google Sheets backend** (`src/adapters/sheets/`) reading and writing the
  user's own spreadsheet, including creating and seeding it on first use.
- **Google sign-in** without an SDK: the browser-side Google Identity Services
  token flow, on the non-sensitive `drive.file` scope, with the access token held
  in memory only and never persisted.
- **Starter template** (`src/data/starter.ts`): a neutral configuration with no
  personal data, exercising every field type and display rule. Used both to seed
  a new spreadsheet and as the demo configuration.
- **Four screens** — the evening form with quick add, the journal (notes and
  events, filterable by tag), the dashboard (calendar heatmap, trend charts, per-
  metric cards, sliceable by tag) and settings. All charts are hand-drawn SVG.
- **Unit tests** covering the domain core — dates, values, schedules, the tabular
  mapping, the form engine, the statistics — and the local backend.
- **React shell** — settings, backend selection, and the `useTracker` hook that
  owns the snapshot, applies answers optimistically and persists them on a short
  debounce, flushing when the tab is hidden.
- **PWA shell** — web manifest, icons, and a hand-written service worker that
  serves navigations network-first, hashed assets cache-first, and never touches
  `googleapis.com` or `accounts.google.com`.
- **Project infrastructure** — MIT licence, contributing guide, code of conduct,
  security policy, issue and pull-request templates, Dependabot, CI on every push
  and pull request, and deployment to GitHub Pages.
- **Documentation** — architecture, data model, Google setup, deployment and
  roadmap, under `docs/`.

[Unreleased]: https://github.com/vbousson/habits-tracker/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/vbousson/habits-tracker/releases/tag/v0.1.0
