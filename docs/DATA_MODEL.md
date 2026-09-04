# Data model

This is the authoritative reference for the spreadsheet: every tab, every column,
what it means, what it accepts.

It is derived from the code that actually reads and writes those cells —
[`src/core/tabular.ts`](../src/core/tabular.ts),
[`src/core/schedule.ts`](../src/core/schedule.ts) and
[`src/core/values.ts`](../src/core/values.ts). If you change one of those files,
change this document in the same commit.

The same layout is used by every backend. The local demo stores exactly these
rows in `localStorage`, which is why a mapping bug shows up offline instead of in
your spreadsheet.

## General rules

These apply to every tab.

**Columns are matched by header name, not by position, when reading.** The first
row of each tab is the header. Names are compared trimmed and lower-cased, so a
tab whose columns you have reordered still loads correctly, and a column the app
does not know is simply ignored.

**Writing, however, uses the canonical column order below.** When the app
rewrites a row it emits the columns in that order. So reading tolerates a
reshuffled sheet, but writing to one would scramble it — if you rearrange or
insert columns in a tab the app writes to (`Config`, `Entries`, `Notes`,
`Events`), expect them to be put back, and keep anything precious in a separate
tab.

**A missing optional column is not an error.** An unknown column name reads as an
empty cell, so a sheet that predates a new column still loads. As a last resort,
a tab whose header row is unrecognisable falls back to the canonical column order
listed below.

**Multi-valued cells use a pipe (`|`), never a comma.** Labels contain commas
far too often for a comma to be safe. Empty segments are dropped and each value
is trimmed, so `sport | travail` and `sport|travail` are the same thing.
(The one exception is the `schedule` column, which is a small controlled
vocabulary and accepts commas — see below.)

**Dates are `YYYY-MM-DD`, in your local time.** Never a spreadsheet date serial
and never a UTC timestamp: `2026-03-14` means that calendar day where you live.
Format those columns as plain text if your locale makes Sheets rewrite them.

**Blank rows and rows missing their key columns are skipped silently.** You can
leave gaps in a tab without breaking anything.

**Booleans** are written by the app as `TRUE` / `FALSE`. When reading, it accepts
`TRUE`, `VRAI`, `OUI`, `YES`, `Y`, `O`, `1`, `X` as true and
`FALSE`, `FAUX`, `NON`, `NO`, `N`, `0` as false, in any case. Anything else reads
as "not answered", which is *not* the same as "no".

## Tabs at a glance

| Tab | One row is | Key columns |
| --- | --- | --- |
| `Config` | one thing you track | `id` |
| `Tags` | a colour-coded theme | `id` |
| `Entries` | one answer, for one day | `date` + `metric_id` |
| `Notes` | a free-text journal line | `id` |
| `Events` | a milestone or a period | `id` |
| `Meta` | one internal key/value pair | `key` |
| `Guide` | documentation, not data | — |

---

## `Config` — what you track

The heart of the app. Everything the daily form shows, everything the dashboard
can chart, is defined here. There is nothing in the code that knows about
"sleep" or "urticaria"; there are only rows in this tab.

Canonical column order:

```
id | label | type | options | min | max | unit | tags | group | schedule | mode | depends_on | order | color | help | active
```

| Column | Required | Meaning | Accepted values | Empty means |
| --- | --- | --- | --- | --- |
| `id` | **yes** | Stable identifier, used in `Entries.metric_id` and in `depends_on`. Renaming it orphans the history. | Letters, digits and `_`. Keep it ASCII and lower-case: `sommeil`, `velo_travail`. | the row is skipped |
| `label` | no | What you actually see in the form. | Any text, accents welcome. | falls back to `id` |
| `type` | no | The field type. See the table below. | `bool`, `scale`, `choice`, `number`, `text` | `bool` — as does any unrecognised value |
| `options` | for `scale` / `choice` | The levels or the labels. **Order matters for `scale`**: lowest first. | Pipe-separated: `Aucun\|Légers\|Modérés\|Forts` | no options |
| `min` | no | Lower bound for `number`, and the 0 of the normalised scale. | A number | treated as `0` when normalising |
| `max` | no | Upper bound for `number`, and the 1 of the normalised scale. | A number | no upper bound; the value normalises to 0 or 1 only |
| `unit` | no | Displayed after the number. | `min`, `km`, `mg`, `h` | no unit shown |
| `tags` | no | Themes this metric belongs to. Several are allowed — cycling to work is both `sport` and `travail`. | Pipe-separated `Tags.id` values | untagged |
| `group` | no | Section heading in the form. Sections appear in the order their first metric does. | Any text: `Santé`, `Forme` | `Divers` |
| `schedule` | no | Which days the question is asked. See **Schedules** below. | `daily`, `weekdays`, `weekends`, `never`, or a day list | `daily` |
| `mode` | no | Where the metric shows up. See **Modes** below. | `daily`, `quick`, `both` | `daily` — as does any unrecognised value |
| `depends_on` | no | The `id` of a parent metric. The question is only asked once the parent has been answered positively. See **Dependent questions** below. | Another row's `id` | top-level question |
| `order` | no | Sort position within the form. Sorted ascending, ties broken by label. | A number. Leave gaps (10, 20, 30) so you can insert later. | the row's position in the tab |
| `color` | no | Overrides the colour inherited from the first tag. | A CSS colour: `#3d6fd8` | inherits from the first tag |
| `help` | no | A hint shown under the field. | Any text | no hint |
| `active` | no | Set to `FALSE` to retire a metric without deleting its history. | A boolean | **active** — an empty cell means yes, because people add rows without filling it in |

> `active` is asymmetric on purpose: only an explicit falsy value deactivates a
> row. A typo in that cell leaves the metric visible rather than making it
> vanish silently.

### Field types

| `type` | The question is | Stored as | Counts as "yes" when | Normalises to 0..1? |
| --- | --- | --- | --- | --- |
| `bool` | Yes / no | `TRUE` or `FALSE` | it is `TRUE` | yes — 0 or 1 |
| `scale` | An ordered level | the level's **label**, not its index | the level is **above the first one** | yes — position over `options.length - 1` |
| `choice` | An unordered label | the label | any non-empty answer | no — categorical values have no order |
| `number` | A quantity | the number | it is `> 0` | yes — `(value - min) / (max - min)`, clamped |
| `text` | Free text | the text | any non-empty text | no |

Three consequences worth knowing:

- **`scale` levels are stored by label.** Your sheet stays readable, and you can
  reorder or rename levels later without rewriting history — but a value whose
  label is no longer in `options` reads as "not answered".
- **The first level of a `scale` is falsy.** `Aucun` symptoms is not an event, so
  it does not reveal `depends_on` children and does not count towards a positive
  rate. Put your neutral level first.
- **`choice` accepts anything.** Unlike `scale`, a value outside `options` is
  kept as-is rather than dropped. Use `choice` when the list may grow.

Numbers accept a comma as the decimal separator (`7,5` reads as `7.5`), because
French keyboards and French spreadsheets both produce it.

### Schedules

`schedule` decides which weekdays a question appears on. It keeps the evening
routine short: commuting questions stay out of the way at the weekend.

| Cell | Days | Also accepted |
| --- | --- | --- |
| `daily` | every day | empty, `quotidien`, `tous` |
| `weekdays` | Monday–Friday | `semaine`, `ouvres`, `ouvrés` |
| `weekends` | Saturday and Sunday | `weekend`, `we` |
| `never` | none — pair it with `mode: quick` | `jamais` |
| a day list | exactly those days | see below |

A day list is separated by commas, semicolons, slashes or spaces, and each day
may be written in French or English, abbreviated or in full:

```
mon,wed,fri
lun,mer,ven
lundi mercredi vendredi
sam;dim
```

Recognised: `sun`/`dim`/`dimanche`, `mon`/`lun`/`lundi`, `tue`/`mar`/`mardi`,
`wed`/`mer`/`mercredi`, `thu`/`jeu`/`jeudi`, `fri`/`ven`/`vendredi`,
`sat`/`sam`/`samedi`, plus the full English names.

**A cell that cannot be parsed at all falls back to `daily`.** A mistyped
schedule shows the question too often, which you will notice, rather than hiding
it forever, which you would not. Note that a list with *no* recognisable day
(`mondayy`) is treated as unparseable and therefore becomes `daily` — only the
explicit word `never` empties a schedule.

Your cell is written back verbatim, so `lun,mer,ven` stays `lun,mer,ven` in your
sheet rather than being normalised to English.

### Modes

`mode` decides *where* a metric is reachable, independently of *when*.

| `mode` | In the evening form | Behind the quick-add button | For |
| --- | --- | --- | --- |
| `daily` | yes, on its scheduled days | no | the routine |
| `quick` | never | yes | rare events you record the moment they happen |
| `both` | yes | yes | things that are routine *and* occasionally urgent |

A `quick` metric is excluded from the "how complete was this day" score, since it
was never asked — but once it has been recorded, it counts towards that day's
overall picture. A flare-up is part of the day whether or not anyone asked.

The idiomatic rare-event row is `schedule: never` **and** `mode: quick`: never
proposed, always one tap away.

### Dependent questions (`depends_on`)

This is the feature people do not discover on their own, and it is what removes
the need for composite field types.

A row with `depends_on` set is hidden until the metric it names has been answered
positively **for the same day**. Answer the parent, and the follow-up appears,
indented. Clear the parent, and it disappears again.

Rules:

- Positivity is the `isTruthy` rule from the table above: `TRUE` for a boolean, a
  level above the first for a `scale`, greater than zero for a `number`, any
  non-empty text for `choice` and `text`.
- **A dependent metric ignores its own `schedule`.** Once the parent has fired,
  the follow-up is relevant whatever day it is.
- Chains are allowed: a child can itself be the parent of another row. Each level
  is indented one step further.
- A row may have several children; they all appear together.
- Cycles are detected and stop the chain rather than hanging the app, but do not
  write one.
- A child inherits its parent's reachability: a follow-up to a `quick` metric is
  asked inside the quick-add sheet, not in the evening form.

### A worked `Config`

This is a trimmed version of the starter template shipped in
[`src/data/starter.ts`](../src/data/starter.ts). Columns with nothing interesting
in them are omitted; in the real sheet they are simply empty.

| id | label | type | options | min | max | unit | tags | group | schedule | mode | depends_on | order |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `traitement_fond` | Traitement de fond pris | `bool` | | | | | `sante` | Santé | `daily` | `daily` | | 10 |
| `antihistaminique` | Antihistaminique pris | `bool` | | | | | `sante` | Santé | `daily` | `daily` | | 20 |
| `antihistaminique_motif` | Motif de la prise | `choice` | `Allergie respiratoire\|Urticaire\|Préventif\|Autre` | | | | `sante` | Santé | `daily` | `daily` | `antihistaminique` | 21 |
| `symptomes_respiratoires` | Symptômes respiratoires | `scale` | `Aucun\|Légers\|Modérés\|Forts` | | | | `sante` | Santé | `daily` | `daily` | | 30 |
| `crise_urticaire` | Crise d'urticaire | `bool` | | | | | `sante` | Santé | `never` | `quick` | | 40 |
| `urticaire_intensite` | Intensité de la crise | `scale` | `Légère\|Moyenne\|Forte` | | | | `sante` | Santé | `daily` | `daily` | `crise_urticaire` | 41 |
| `urticaire_cause` | Cause présumée | `text` | | | | | `sante` | Santé | `daily` | `daily` | `crise_urticaire` | 42 |
| `velo_travail` | Trajet domicile-travail à vélo | `bool` | | | | | `sport\|travail` | Sport & travail | `weekdays` | `daily` | | 50 |
| `seance_sport` | Séance de sport du soir | `bool` | | | | | `sport` | Sport & travail | `daily` | `daily` | | 60 |
| `seance_duree` | Durée de la séance | `number` | | 0 | 180 | min | `sport` | Sport & travail | `daily` | `daily` | `seance_sport` | 61 |
| `sport_club` | Sport en club | `bool` | | | | | `sport\|social` | Sport & travail | `mon,wed,fri` | `daily` | | 70 |
| `batch_cooking` | Batch cooking | `bool` | | | | | `alimentation` | Alimentation | `weekends` | `daily` | | 100 |
| `energie` | Niveau d'énergie | `scale` | `Faible\|Moyen\|Bon\|Excellent` | | | | `forme` | Forme | `daily` | `daily` | | 140 |

Read a few rows out loud and the design should click:

- **`antihistaminique` → `antihistaminique_motif`.** Two boolean-ish questions
  most days, one extra question on the days it matters. No "boolean with an
  optional reason" field type had to be invented.
- **`crise_urticaire` → `urticaire_intensite` → `urticaire_cause`.** A rare event
  that is never asked (`schedule: never`, `mode: quick`) but that unfolds into
  two follow-ups the moment you record it. This is the case that motivated
  `depends_on` in the first place.
- **`velo_travail` on `weekdays`, `batch_cooking` on `weekends`,
  `sport_club` on `mon,wed,fri`.** Three schedules, no code.
- **`seance_duree` with `min` 0 and `max` 180.** Those bounds are not just
  validation: they are what lets a 90-minute session normalise to 0.5 and be
  averaged next to a boolean.
- **`velo_travail` tagged `sport|travail`.** It legitimately belongs to both, and
  the dashboard can slice by either.

---

## `Tags` — themes and colours

```
id | label | color
```

| Column | Required | Meaning |
| --- | --- | --- |
| `id` | **yes** | Referenced from `Config.tags`, `Notes.tags` and `Events.tags`. Rows without one are skipped. |
| `label` | no | Display name. Falls back to `id`. |
| `color` | no | CSS colour, used for the metric's accent and for chart series. Defaults to a neutral grey (`#8892a4`). |

The starter set is `sante`, `sport`, `travail`, `alimentation`, `famille`,
`forme`, `social`. Rename them, delete them, add your own — nothing in the code
refers to any particular tag.

---

## `Entries` — the answers

The long format: **one row per day and per metric**, not one row per day with a
column per metric. It means adding a metric never restructures the sheet, and a
metric you stopped tracking simply stops producing rows.

```
date | metric_id | value | updated_at
```

| Column | Required | Meaning |
| --- | --- | --- |
| `date` | **yes** | `YYYY-MM-DD`, local time. Rows without it are skipped. |
| `metric_id` | **yes** | A `Config.id`. Rows naming a metric that no longer exists are dropped on load, so deleting a `Config` row is safe. |
| `value` | no | The raw cell. It is only interpreted once the config is known, according to the metric's `type`. An empty cell means "not answered", which is **not** the same as `FALSE`. |
| `updated_at` | no | ISO-8601 timestamp of the last write. Informational; the app does not resolve conflicts with it. |

The pair (`date`, `metric_id`) identifies an answer. Saving a day upserts on that
pair. If the tab happens to contain two rows for the same pair, **the later row
wins** — which is what makes an append-only write safe: a correction appended at
the bottom overrides the original.

Example:

| date | metric_id | value | updated_at |
| --- | --- | --- | --- |
| 2026-03-14 | `traitement_fond` | `TRUE` | 2026-03-14T21:40:12.004Z |
| 2026-03-14 | `symptomes_respiratoires` | `Légers` | 2026-03-14T21:40:19.881Z |
| 2026-03-14 | `seance_sport` | `TRUE` | 2026-03-14T21:40:31.117Z |
| 2026-03-14 | `seance_duree` | `45` | 2026-03-14T21:40:36.402Z |
| 2026-03-15 | `crise_urticaire` | `TRUE` | 2026-03-15T14:02:55.310Z |
| 2026-03-15 | `urticaire_intensite` | `Moyenne` | 2026-03-15T14:03:04.775Z |
| 2026-03-15 | `urticaire_cause` | `Piscine` | 2026-03-15T14:03:22.918Z |

You can edit this tab by hand. Type a value the way the field type expects it —
a `scale` wants one of its `options` labels, a `bool` wants `TRUE`/`FALSE` or
`OUI`/`NON`. The app will read it on the next load.

---

## `Notes` — the journal

Free-text lines attached to a day and categorised by tag rather than by metric.
This is where something goes before it is worth becoming a metric.

```
id | date | tags | text | created_at
```

| Column | Required | Meaning |
| --- | --- | --- |
| `id` | **yes** | Opaque unique id, generated by the app. |
| `date` | **yes** | The day the note is about, `YYYY-MM-DD`. |
| `tags` | no | Pipe-separated `Tags.id` values. |
| `text` | no | The note itself. |
| `created_at` | no | ISO-8601 timestamp. |

---

## `Events` — milestones and periods

```
id | label | start | end | tags | note
```

| Column | Required | Meaning |
| --- | --- | --- |
| `id` | **yes** | Opaque unique id. |
| `label` | no | `Vacances`, `Rush release`, `Changement de traitement`. |
| `start` | **yes** | `YYYY-MM-DD`. Rows without it are skipped. |
| `end` | no | `YYYY-MM-DD`. **Defaults to `start`**, which is how a single-day milestone is expressed: leave it empty. |
| `tags` | no | Pipe-separated `Tags.id` values. |
| `note` | no | Free text. |

Events are context for the charts: a run of bad sleep reads differently over a
week labelled `Rush release`.

---

## `Meta` — internal bookkeeping

```
key | value
```

A plain key/value tab, written and read by the backend rather than by you. It
carries things like `schema_version`, so that a future version of the app can
recognise an older spreadsheet and migrate it instead of misreading it.

Do not delete the tab. There is no reason to edit it.

---

## `Guide` — documentation in place

A human-readable tab created alongside the others when the app sets up your
spreadsheet, so that someone opening the file in two years — you, most likely —
can understand it without finding this repository. It holds no data and is never
parsed.

---

## Editing your sheet by hand

Encouraged. That is the whole point of using a spreadsheet: your data is not
trapped behind an app, and you can fix, bulk-edit, chart or export it with tools
you already know.

Things worth remembering:

- **Reload the app after editing.** It holds a snapshot in memory and will
  otherwise overwrite your change on its next save.
- **Never reuse a `Config.id`** for a different metric. The history follows the
  id, so recycling one silently merges two different things. Retire the old row
  with `active` = `FALSE` instead — its past entries stay readable and stop
  counting.
- **Renaming a `label` is free.** Renaming an `id` is not.
- **Renaming a `scale` level** makes past values with the old label read as
  unanswered. Find-and-replace them in `Entries` at the same time, or keep the
  old label and change only its display order.
- **Keep the date columns as text** if your spreadsheet locale insists on
  turning `2026-03-14` into a date serial.
- **Extra columns are read-safe, not write-safe.** The app ignores columns it does
  not know when loading, but it rewrites rows in the canonical column order, so
  anything you added to `Config`, `Entries`, `Notes` or `Events` can be
  overwritten the next time that row is saved. Put your own working columns in a
  separate tab, where nothing will touch them.
