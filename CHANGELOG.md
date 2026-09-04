# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Because the app is a static site, "releasing" means tagging a commit; users
always run whatever the deployment currently serves. The versions below exist so
that bug reports can name something precise.

## [Unreleased]

Nothing yet.

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
- **Printable summary and CSV export** for a medical appointment: a date range,
  the metrics, and the notes and events in that window.
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
  and pull request, and deployment to GitHub Pages (with a GitLab Pages
  equivalent).
- **Documentation** — architecture, data model, Google setup, deployment and
  roadmap, under `docs/`.

[Unreleased]: https://github.com/vbousson/habits-tracker/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/vbousson/habits-tracker/releases/tag/v0.1.0
