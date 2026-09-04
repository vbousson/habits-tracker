<div align="center">

# Habits Tracker

**A habit and health tracker that keeps your data in your own Google Sheet — and nowhere else.**

[![CI](https://github.com/vbousson/habits-tracker/actions/workflows/ci.yml/badge.svg)](https://github.com/vbousson/habits-tracker/actions/workflows/ci.yml)
[![Deploy](https://github.com/vbousson/habits-tracker/actions/workflows/deploy.yml/badge.svg)](https://github.com/vbousson/habits-tracker/actions/workflows/deploy.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Live demo](https://img.shields.io/badge/demo-live-2f9e63)](https://vbousson.github.io/habits-tracker/)

</div>

> **The interface is in French.** The code, the comments and this documentation
> are in English; the app itself speaks to a French-speaking audience. If you
> want another language, [say so](https://github.com/vbousson/habits-tracker/issues) —
> the strings are ready to be extracted, it just has not been worth doing yet.

## Why this exists

Tracking a chronic symptom alongside sleep, exercise and mood is genuinely useful
— your GP will ask, and "I think it got worse in March?" is not an answer. But
every app that does it wants your health data on its servers, charges a
subscription for a chart, and tracks the eleven things *it* decided matter rather
than the three that matter to you.

So: a tracker where **the configuration lives in a spreadsheet instead of in the
code**, and **the spreadsheet is yours**. Nothing in this repository knows what
"sleep" or "urticaria" is. There are only rows in a `Config` tab, which you write.
The app renders the form, applies the display rules, and does the arithmetic.

There is no server. There is no account. There is no analytics. The author cannot
see your data, and has arranged things so that this is true by construction rather
than by promise.

## Screenshots

<!--
  TODO: real screenshots.

  Drop PNGs into docs/screenshots/ and reference them here, e.g.:

      <img src="docs/screenshots/today.png"     width="240" alt="Formulaire du soir">
      <img src="docs/screenshots/dashboard.png" width="240" alt="Tableau de bord">
      <img src="docs/screenshots/journal.png"   width="240" alt="Journal">

  Take them on a phone-width viewport (390x844 works well) with the local demo
  backend and the starter configuration, in light and dark. Do not use a real
  journal: the starter template exists precisely so screenshots contain no
  personal data.
-->

_Not captured yet. In the meantime, the [live demo](https://vbousson.github.io/habits-tracker/)
runs the real app entirely in your browser, with no sign-in._

## Features

- **Everything is configured in your spreadsheet.** Metrics, labels, groups,
  colours, tags — you add a row, the app shows a question. No deploy, no code.
- **Five field types**: yes/no, ordered scale, choice, number with a unit and
  bounds, free text.
- **Schedules**, so the evening form stays under a minute. Ask about commuting on
  weekdays, batch cooking at weekends, club training on Monday/Wednesday/Friday.
- **Follow-up questions** (`depends_on`). Answer "flare-up: yes" and the intensity
  and presumed-cause questions appear, indented. Answer no and they stay out of
  the way. This is what replaces a dozen bespoke composite field types — and it
  is the feature most people do not find on their own, so
  [there is a worked example below](#configuring-your-metrics).
- **Quick add** for rare events, so recording something at 14:00 does not mean
  opening the evening form.
- **Journal and events**: free-text notes tagged by theme, and periods
  ("holiday", "release rush") you can read your charts against.
- **Statistics**: a calendar heatmap, completion, positive rates, streaks that
  only break on days a metric was actually due, weekly and monthly series, trend
  against the previous window — and a blank where there is not enough data,
  rather than an invented trend. Charts are hand-drawn SVG; the whole dashboard
  slices by tag.
- **A printable summary for your doctor**: pick a date range, get one page of
  metrics, notes and events — plus the same selection as CSV.
- **Offline demo backend**, so you can try the real app with no Google account at
  all. It is not a mock: it runs the same form engine and the same statistics.
- **Installable PWA** with a hand-written service worker. Works offline, opens
  from the home screen, respects your safe areas and your dark mode.
- **Two runtime dependencies**: `react` and `react-dom`. No chart library, no UI
  kit, no router, no state manager, no Google SDK.

## How it works

The whole design turns on one seam: the UI talks to a `HabitRepository`, and
nothing else. It has no idea where the bytes end up.

```
   your phone / browser                                    your Google Drive
┌──────────────────────────────┐                        ┌────────────────────┐
│  src/ui/     the screens     │                        │   your spreadsheet │
│              French, colours │                        │   Config           │
└──────────────┬───────────────┘                        │   Tags             │
               │                                        │   Entries          │
┌──────────────▼───────────────┐                        │   Notes            │
│  src/lib/    useTracker      │                        │   Events           │
│              settings, auth  │                        │   Meta · Guide     │
└──────────────┬───────────────┘                        └──────────▲─────────┘
               │                                                   │
    ┌──────────▼───────────┐                                       │
    │   HabitRepository    │   load · saveDay · saveNote · …       │
    │   ── the seam ──     │                                       │
    └──┬────────────────┬──┘                                       │
       │                │                                          │
┌──────▼──────┐  ┌──────▼───────┐   direct HTTPS, browser → Google │
│  local      │  │  sheets      │──────────────────────────────────┘
│ localStorage│  │ Sheets API   │
└─────────────┘  └──────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  src/core/   types · dates · values · schedule · tabular        │
│              form engine · statistics                            │
│              no React, no DOM, no Google — this is where the     │
│              tests live                                          │
└─────────────────────────────────────────────────────────────────┘
```

Two consequences worth stating plainly:

- **There is no server in that diagram, and no box for one.** Requests go from
  your browser to Google and back. Nothing is proxied. There is no machine of
  ours in the path, which is why the privacy section below is short.
- **Adding a REST backend later is one more file** and one branch in
  `src/lib/backend.ts`. No screen changes. That is the entire reason the seam is
  there.

Full detail in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Quick start

### 1. Try it, with no account

Open the **[live demo](https://vbousson.github.io/habits-tracker/)**. It starts on
the local backend: the starter configuration is loaded, everything is stored in
your browser, nothing leaves your device. Fill in a day, look at the dashboard,
add a note. Clearing your site data deletes it all.

If you like it, install it to your home screen from your browser's menu.

### 2. Connect your own Google Sheet

When you want the data to persist and sync across devices, follow
**[docs/GOOGLE_SETUP.md](docs/GOOGLE_SETUP.md)**. In outline:

1. Create a Google Cloud project and an OAuth client for a web app. It is free,
   and it takes about ten minutes.
2. Paste the client id into the app's Settings screen.
3. Sign in. The app creates a spreadsheet in **your** Drive and seeds it with the
   starter template — `Config`, `Tags`, `Entries`, `Notes`, `Events`, `Meta`, and
   a `Guide` tab explaining the file to whoever opens it in two years.
4. Edit the `Config` tab to track your own things.

The app requests the `drive.file` scope, which gives it access **only to files it
created itself** — not to the rest of your Drive.

> Setting up your own deployment as well, and want one ordered checklist instead
> of several documents? **[docs/INSTALLATION.md](docs/INSTALLATION.md)** is the
> single path from a fresh fork to a working deployed app — Google Cloud, GitHub
> Pages, the build secret, and the repository settings that silently break things
> when skipped. It is written in French, like the app itself.

### 3. Make it yours

Open the `Config` tab and start editing. Rename what nearly fits, delete what does
not apply, add rows for what is missing. Reload the app and your form has changed.
See the next section, and [docs/DATA_MODEL.md](docs/DATA_MODEL.md) for the full
column reference.

## Run it yourself

You do not need to fork it to use it — the hosted demo works with your own
spreadsheet, since your client id is a runtime setting. Fork it if you want your
own deployment, your own domain, or your own changes.

```sh
git clone https://github.com/vbousson/habits-tracker.git
cd habits-tracker
npm ci
npm run dev          # http://localhost:5173, local backend, no Google needed
```

Requires Node 20+ (see `.nvmrc`). Other commands:

```sh
npm run test         # unit tests (Vitest)
npm run lint         # ESLint
npm run typecheck    # tsc --noEmit, strict
npm run build        # -> dist/
npm run preview      # serve the built dist/
```

To deploy your fork to GitHub Pages: enable Pages with **Source: GitHub Actions**,
push to `main`, and the shipped workflow does the rest. Two details decide whether
it works — the base path and the SPA fallback — and both are handled for you and
explained in **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)**, along with plain
static hosting.

## Configuring your metrics

This is the part worth reading. Everything below is rows in the `Config` tab of
your own spreadsheet.

| id | label | type | options | min | max | unit | tags | group | schedule | mode | depends_on | order |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `sommeil` | Qualité du sommeil | `scale` | `Mauvaise\|Moyenne\|Bonne\|Excellente` | | | | `forme` | Forme | `daily` | `daily` | | 10 |
| `velo_travail` | Trajet domicile-travail à vélo | `bool` | | | | | `sport\|travail` | Sport | `weekdays` | `daily` | | 20 |
| `sport_club` | Sport en club | `bool` | | | | | `sport\|social` | Sport | `mon,wed,fri` | `daily` | | 30 |
| `seance_duree` | Durée de la séance | `number` | | 0 | 180 | min | `sport` | Sport | `daily` | `daily` | `sport_club` | 31 |
| `crise_urticaire` | Crise d'urticaire | `bool` | | | | | `sante` | Santé | `never` | `quick` | | 40 |
| `urticaire_intensite` | Intensité de la crise | `scale` | `Légère\|Moyenne\|Forte` | | | | `sante` | Santé | `daily` | `daily` | `crise_urticaire` | 41 |
| `urticaire_cause` | Cause présumée | `text` | | | | | `sante` | Santé | `daily` | `daily` | `crise_urticaire` | 42 |

Read out loud:

- **`sommeil`** is asked every evening as four ordered levels. Because the levels
  are ordered, the app can average it, chart it, and put it next to a checkbox on
  the same 0..1 axis. The **first level is treated as "no"** — so put your neutral
  level first.
- **`velo_travail`** only appears Monday to Friday, and **`sport_club`** only on
  Monday, Wednesday and Friday. Day lists accept French or English, abbreviated or
  full: `lun,mer,ven` works exactly as well. A metric you are not asked about on a
  given day does not count against your completion, and a missing weekend does not
  break your streak.
- **`seance_duree`** appears only once `sport_club` is answered yes — that is
  `depends_on`. Its `min` and `max` are not just validation: they are what let 90
  minutes normalise to 0.5 and be averaged alongside everything else.
- **`crise_urticaire`** is the interesting one. `schedule: never` plus
  `mode: quick` means it is **never asked in the evening form** but is always one
  tap away behind the quick-add button. Record a flare-up at 14:00 and the two
  follow-ups — intensity, then presumed cause — unfold underneath it. Answer it
  no, or not at all, and neither one ever appears.

That last pattern is why there is no "boolean with an optional severity and a
comment" field type. There does not need to be one: three ordinary rows and a
`depends_on` do the job, and you can rearrange them yourself without touching any
code.

Chains go as deep as you like, a parent can have several children, and a
dependent question ignores its own schedule — once the parent has fired, the
follow-up is relevant whatever day it is.

Every column, every accepted value, and the other tabs (`Entries`, `Notes`,
`Events`, `Meta`) are documented in **[docs/DATA_MODEL.md](docs/DATA_MODEL.md)**.

## Project layout

```
src/
  core/          the domain. Pure TypeScript, no React, no DOM, no Google.
    types.ts       metrics, tags, entries, notes, events, snapshots
    date.ts        YYYY-MM-DD arithmetic in local time, French labels
    values.ts      the only bridge between cells (strings) and values
    schedule.ts    parses `schedule`, answers "is this due today?"
    tabular.ts     the canonical row layout every backend speaks
    form.ts        which questions to ask today, and at which indent
    stats.ts       day scores, rates, streaks, series, trends
    colors.ts      tag and heatmap colours, composed from the design tokens
    repository.ts  the HabitRepository interface and shared helpers
  adapters/      storage backends, one folder each
    local/         localStorage — the offline demo and the reference impl
    sheets/        the Google Sheets API
  lib/           settings, backend selection, Google auth, the state hook
  ui/            screens, components, styles — French strings live here
                 charts are hand-drawn SVG, no chart library
  data/          the neutral starter template (no personal data)
tests/           unit tests for src/core/
docs/            architecture, data model, Google setup, deployment, roadmap
public/          manifest, icons, service worker, robots.txt
scripts/         the reproducible icon generator
```

## 🔒 Privacy

The short version: **your data never touches a machine belonging to this
project's author, because there isn't one.**

- **No server.** The app is a bundle of static files. GitHub Pages serves them;
  it never sees what you type.
- **Two possible destinations, both yours.** Your browser's `localStorage` in demo
  mode, or a spreadsheet in your own Google Drive. Nothing else.
- **Direct to Google.** Requests to the Sheets API go from your browser straight
  to Google. Nothing is proxied, relayed, mirrored or logged in between.
- **A narrow scope.** The app asks for `drive.file`, which grants access **only to
  files it created itself**. The rest of your Drive is invisible to it.
- **The token is never stored.** The OAuth access token lives in a JavaScript
  variable and dies with the tab. It is not written to `localStorage`, to a
  cookie, or to disk, and there is no refresh token.
- **No analytics, no telemetry, no error reporting, no third-party script, no
  cookie, no tracking pixel.** The app makes no outbound request other than to
  Google's own APIs, and only once you have explicitly connected your account.
- **You can read the code**, and you can read your data — it is a spreadsheet.
  Nothing is encoded, encrypted, or otherwise made inconvenient to leave with.

If you are about to report the OAuth client id as a leaked secret: it is public by
design, there is no client secret anywhere, and [SECURITY.md](SECURITY.md)
explains exactly why.

**This is not a medical device.** It records what you tell it and does arithmetic
on it. It does not diagnose, advise or interpret, and it is not a substitute for a
doctor.

## Contributing

Contributions are welcome. Two rules matter more than any style preference:

1. **The UI never imports a backend** — everything goes through
   `HabitRepository`, and only `src/lib/backend.ts` picks an implementation.
2. **`src/core/` stays free of React, of the DOM and of Google** — that is what
   makes it testable, and it is where the tests live.

Read [CONTRIBUTING.md](CONTRIBUTING.md) for the setup, the commands, the commit
convention, and the exact files to touch for a new field type or a new backend.
It is also honest about review latency: this is a spare-time project.

- 🐛 [Report a bug](https://github.com/vbousson/habits-tracker/issues/new?template=bug_report.yml)
  — please, no personal health data in a public issue.
- 💡 [Request a feature](https://github.com/vbousson/habits-tracker/issues/new?template=feature_request.yml)
  — check [the roadmap](docs/ROADMAP.md) first; a lot of "missing features" are
  configuration.
- 🔐 [Report a vulnerability privately](https://github.com/vbousson/habits-tracker/security/advisories/new)
  — see [SECURITY.md](SECURITY.md).

This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md).

## Documentation

| | |
| --- | --- |
| [INSTALLATION.md](docs/INSTALLATION.md) | 🇫🇷 The ordered end-to-end setup runbook: Google Cloud, GitHub Pages, the build secret, repo settings, troubleshooting. Start here to deploy. |
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | The layers, the `HabitRepository` seam, one answer traced end to end, how to add a backend or a field type. |
| [DATA_MODEL.md](docs/DATA_MODEL.md) | Every tab, every column, every accepted value. The authoritative reference. |
| [GOOGLE_SETUP.md](docs/GOOGLE_SETUP.md) | Google Cloud project, OAuth client, your spreadsheet. |
| [DEPLOYMENT.md](docs/DEPLOYMENT.md) | GitHub Pages, any static host, and what to do when it 404s. |
| [ROADMAP.md](docs/ROADMAP.md) | What is done, what is planned, and what is deliberately not. |
| [CHANGELOG.md](CHANGELOG.md) | Notable changes, [Keep a Changelog](https://keepachangelog.com/) format. |

## Licence

[MIT](LICENSE) © 2026 Valentin Bousson.
