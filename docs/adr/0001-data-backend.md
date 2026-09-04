# ADR 0001 — Where the data lives

- **Status:** accepted
- **Date:** 2026-09-05
- **Deciders:** the maintainer (single-user project)
- **Supersedes / superseded by:** —
- **Related:** [ADR 0002 — Reminders](0002-reminders.md), [ROADMAP.md](../ROADMAP.md) lot 5

---

## 1. Context

The app is a static site on GitHub Pages. There is no server, no account, two
runtime dependencies (`react`, `react-dom`), and storage sits behind the
`HabitRepository` interface — seven methods, nine once the goals feature's
`saveGoal`/`deleteGoal` land — with two implementations today: `localStorage` and
Google Sheets. The privacy property is not a policy, it is a
topology: the data exists in the user's own Drive and in the user's own browser,
and the maintainer has no machine in the path from which to see it.

Two things prompted this ADR:

1. The Sheets adapter rewrites the whole `Entries` tab on every save. That is
   documented in the adapter's own header comment as a known ceiling ("past
   roughly 5 000 entry rows … this should become an append + periodic compaction
   scheme"). The question is whether that ceiling is a reason to change backend.
2. The **goals** feature is being added, and the suspicion is that "maybe putting
   this in a spreadsheet is no longer enough".

### 1.1 The volume, measured rather than guessed

| Quantity | Value |
| --- | --- |
| Users | 1 |
| Form fills | 1 per day |
| Answers per fill | 20–40, call it 30 |
| `Entries` rows per year | ~11 000 |
| `Entries` rows after 10 years | ~110 000 |
| Bytes per row on the wire (JSON, `["2026-03-14","symptomes_respiratoires","Légers","2026-03-14T21:40:19.881Z"]`) | ~80 B |
| `Entries` payload after 1 / 5 / 10 years | ~0.9 MB / ~4.4 MB / ~8.8 MB |
| Cells consumed (`columnCount` is 8 per `bootstrap.ts`) after 10 years | ~880 000 |
| Read pattern | one `load()` per session, everything at once |
| Write pattern | one debounced `saveDay` per 700 ms burst, ~5–15 per evening |
| Config rows | tens (`Config` 17 columns, `Tags` 3, `Goals` 16) |
| Current whole-app bundle | 297 kB raw JS, **93.8 kB gzipped** (measured on `dist/` at 2026-09-05, React included) |

**This dataset is tiny.** A decade of it fits in a few megabytes and is
comfortably held in a browser tab. Every option below must be judged against
that, not against a hypothetical multi-tenant future that this project's roadmap
explicitly refuses ("A hosted multi-user service … would trade the project's best
property for convenience").

---

## 2. Decision drivers

Ordered. The first three dominate; a candidate that fails one of them is out
regardless of how it scores elsewhere.

| # | Driver | Why it ranks here |
| --- | --- | --- |
| **D1** | **The maintainer must not be able to see the data.** | It is the project's single best property and the reason it exists. Any design where the data or a decryption key transits a machine the maintainer controls fails outright. |
| **D2** | **Nothing to operate.** | Spare-time project, one user. Infrastructure that can rot, expire, get paused, or need a credential rotated is a permanent tax on attention. "There is no infrastructure" is a feature with a real, recurring value. |
| **D3** | **Cost floor of ~€0/month.** | Stated requirement: "without paying too much for an external service". A fixed monthly floor for a few megabytes of data is the thing to avoid. |
| **D4** | **The config editor stays free.** | The configuration lives in the spreadsheet, so **the app needs no config-editor UI at all**. This is not a small saving — see §5.2. |
| **D5** | **Data stays human-readable and hand-editable.** | Documented and encouraged in [DATA_MODEL.md](../DATA_MODEL.md) ("Editing your sheet by hand — Encouraged"). Bulk-fixing a renamed `scale` level with find-and-replace is a real workflow. |
| **D6** | **Backup and export are free and obvious.** | Drive version history + "download as CSV" cost zero lines of code. |
| **D7** | **Terraform-provisionable.** | The owner works this way and would rather not click in consoles. Relevant, but only once D1–D3 are satisfied. |
| **D8** | **Low migration effort from the current adapter.** | An afternoon vs a fortnight. |
| **D9** | **Write amplification / latency on mobile data.** | The evening form must not make the user wait. This is the one place the status quo genuinely hurts. |
| **D10** | **Durability.** | The data is a multi-year health record. Losing it is the worst outcome, worse than any of the above. |

Note what is *absent*: scale, concurrency across many writers, query
expressiveness, and multi-user access control. Introducing an option that is good
at those is not a benefit here, it is a cost.

---

## 3. Where the status quo genuinely hurts

Being specific, because "it's a spreadsheet" is not an argument either way.

### 3.1 Write amplification — the real problem

`sheetsRepository.mutate()` does a read-modify-write of the entire tab from the
cached rows, pushed back as one `values:batchUpdate` anchored at `A1`. Cost per
`saveDay`:

| Year | `Entries` rows | Payload per save | Time to upload at 5 Mbit/s uplink |
| --- | --- | --- | --- |
| 1 | 11 000 | ~0.9 MB | ~1.5 s |
| 2.3 | 25 000 | **~2.0 MB** | ~3 s |
| 5 | 55 000 | ~4.4 MB | ~7 s |
| 10 | 110 000 | ~8.8 MB | ~14 s |

Google's own guidance: *"While Sheets API has no hard size limits for an API
request, users might experience limits from different processing components not
controlled by Google Sheets. To speed up requests, we recommend a 2 MB maximum
payload"*, and *"When Sheets processes a request for more than 180 seconds, the
request returns a timeout error"*
([Usage limits](https://developers.google.com/workspace/sheets/api/limits),
page last updated 2026-07-31, checked 2026-09-05).

So the recommended payload is exceeded at around **year 2–3**, and there are
5–15 of these per evening. On mobile data that is the difference between a form
that feels instant and one that spins.

**But this is an adapter bug, not a Sheets limitation.** The fix does not require
a different backend, and it is small — see §7.1.

### 3.2 API quotas

Verified 2026-09-05 at the URL above:

| Quota | Limit |
| --- | --- |
| Read requests / minute / project | 300 |
| Read requests / minute / user / project | 60 |
| Write requests / minute / project | 300 |
| Write requests / minute / user / project | 60 |
| Per-day cap | **none** — "Provided that you stay within the per-minute quotas, there's no limit to the number of requests that you can make per day." |

One user doing 1 load + ~15 debounced writes per day uses **0.4 %** of a single
minute's write budget. The 60/min/user ceiling is only reachable by a retry storm
on a flaky connection, which is a bug to fix in the adapter (backoff), not a
capacity problem. Quotas are a non-issue at this volume, and it is worth saying so
plainly because "Sheets has quotas" is the usual hand-wave for moving off it.

### 3.3 Last-writer-wins against a manual edit

Real and unfixable-by-cleverness. The session holds a cached snapshot; a change
made in Google Sheets (or on a second device) during that session is overwritten
by the next save. [DATA_MODEL.md](../DATA_MODEL.md) already tells the user to
reload after a hand edit, and [ROADMAP.md](../ROADMAP.md) lists conflict handling
as open with the honest note that last-write-wins "is right for a single-user tool
and would not be for anything else".

For one person on one or two devices this costs, empirically, a lost evening's
answers roughly never — provided the app is reloaded before editing. The
append-only write scheme in §7.1 improves this *by accident*: appending a day's
rows cannot clobber unrelated rows, so a concurrent hand edit to a *different*
day survives. That is a better outcome than any of the alternative backends
offers without real conflict resolution.

### 3.4 The 10 000 000-cell limit

Google's documented Sheets limit is *"Up to 10 million cells or 18,278 columns
(column ZZZ)"*
([Files you can store in Google Drive](https://support.google.com/drive/answer/37603),
checked 2026-09-05). At 8 columns per `Entries` row that is ~1.25 million rows,
or **~114 years** at 30 answers a day.
The `Entries` tab is created with `rowCount: 20000` and `growSheet` adds 1 000-row
chunks on demand, so allocation tracks use.

The cell limit is not a constraint on this project. It is worth naming only to
retire it from the discussion.

### 3.5 The `drive.file` scope consequence

`drive.file` is non-sensitive: it grants access only to files the app itself
created, which is why there is no OAuth verification/security-assessment burden
and why the consent screen stays friendly. The price is that **the app must create
the spreadsheet**; a file the user made by hand returns 404/403. This is already
documented in `googleAuth.ts` and in [GOOGLE_SETUP.md](../GOOGLE_SETUP.md).

It also means the app can never operate on the file without a live user-obtained
access token, and the token is deliberately memory-only with no refresh token.
That has one consequence far beyond storage: **no background process — including
the service worker — can ever read the data.** ADR 0002 depends entirely on this
fact.

### 3.6 What is excellent about it, and would be lost

This is the half of the comparison that usually gets skipped.

- **The data is human-readable and hand-editable.** Not "exportable" —
  *editable, in place, with tools the user already knows*. Find-and-replace a
  renamed `scale` level across 11 000 rows: 10 seconds in Sheets, a migration
  script anywhere else.
- **The configuration lives in a spreadsheet, so there is no config-editor UI.**
  17 `Config` columns + 3 `Tags` + 16 `Goals` = 36 columns of CRUD, validation,
  ordering and error handling that simply do not have to exist. The roadmap lists
  in-app config editing as deliberately last: *"the spreadsheet is a perfectly
  good config editor, and building a worse one is not urgent."* Every alternative
  backend makes it **mandatory and blocking**.
- **Backup, versioning and sharing are free.** Drive keeps revision history;
  "share with my GP for a week" is a menu item; "download as CSV" is a menu item.
  Zero lines of code, zero cost, and better than what most of the alternatives
  would ship in a first version.
- **There is no infrastructure to rot.** No project to un-pause, no certificate,
  no credential to rotate, no `terraform apply` that has drifted, no free tier
  whose terms changed. In three years the spreadsheet still opens.
- **Durability is Google's problem**, and Google is better at it than any
  self-managed alternative at this budget.

---

## 4. Options

Each option is assessed against the same grid. "Maintainer-blind" means D1: the
maintainer cannot see the data even in principle.

### 4.1 Google Sheets — status quo

| | |
| --- | --- |
| **Browser-only client** | Native. REST + bearer token, no SDK. Already working. |
| **Cost at this volume** | **€0/month, no free-tier cliff.** The Sheets API is free; quotas are per-minute rate limits, not billed units, and there is no daily cap (verified 2026-09-05). Storage counts against the user's own Drive quota — a Google Sheet's own bytes do *not* count against Drive storage, and even if they did, 9 MB against a 15 GB free allowance is noise. Exceeding a per-minute quota returns HTTP 429; you back off. There is no bill and no way to receive one. |
| **Ops burden** | None. Nothing is provisioned. The only artefact is an OAuth client id in a Google Cloud project, created once. |
| **Durability / backup** | Google's SLA-grade storage; Drive revision history; free CSV/XLSX export; the file survives the app being deleted. Best in class here. |
| **Security model** | User's own Google account, MFA if they have it. Scope `drive.file` — access only to files the app created. Token in memory, no refresh token, no client secret. |
| **Maintainer-blind** | **Yes, by construction.** No server exists. |
| **Terraform** | Partially, and pointlessly: the OAuth client and project can be managed (`google_project`, `google_project_service` for `sheets.googleapis.com`/`drive.googleapis.com`); `google_iap_client`/OAuth-brand resources are awkward and it is a one-time ten-minute click-through. The spreadsheet itself is created at runtime by the app and must be, because of `drive.file`. |
| **Migration effort** | Zero. |
| **Goals feature** | One extra tab, 16 columns. Already implemented — see §5. |
| **Genuine pain** | §3.1 write amplification (fixable in the adapter), §3.3 last-writer-wins (inherent, tolerable at one user). |

### 4.2 Firestore (GCP native)

| | |
| --- | --- |
| **Browser-only client** | Yes, this is its home turf. Security rules replace a backend; offline persistence is built in; the client authenticates via Firebase Auth (Google sign-in) and talks straight to Google. |
| **Cost at this volume** | Free quota, applied **daily**, resetting around midnight Pacific, and available to **exactly one database per project** (a named/non-default database gets none): **50 000 document reads, 20 000 writes, 20 000 deletes, 1 GiB stored, 10 GiB/month outbound**. Beyond that: **$0.03 per 100 000 reads, $0.09 per 100 000 writes, $0.01 per 100 000 deletes**, storage $0.000205479/GiB-hour ≈ **$0.15/GiB-month**. Backups, PITR, restores and TTL deletes have **no** free usage. ([Firestore pricing](https://cloud.google.com/firestore/pricing), checked 2026-09-05 — prices are the page's default region, us-central1; **europe-west1/eur3 not verified**.) **The free tier is only comfortable if you model correctly.** One document per `Entries` row means a `load()` after ten years is **110 000 reads — more than twice the entire daily free allowance, consumed by one session**, at $0.033 per load. One document per *day* holding a map of that day's answers gives 3 650 reads per load, which is fine, but it abandons the long-format row layout every backend currently shares, and with it `core/tabular.ts` reuse. Realistically: **€0/month, if you get the document granularity right on the first try** — and a real, if small, bill if you do not. |
| **Ops burden** | Low but non-zero: a Firebase project, security rules as code, and an auth provider. Rules are the thing that can silently be wrong. |
| **Durability / backup** | Good. Managed backups / PITR are a paid add-on; the free path is an export job to GCS, which is more infrastructure. |
| **Security model** | Rules of the shape `match /users/{uid}/** { allow read, write: if request.auth.uid == uid }` are simple and genuinely sound. |
| **Maintainer-blind** | **No.** The Firebase project belongs to the maintainer. Project-level IAM (Owner/Datastore Owner) can read every document; security rules constrain *clients*, not the project owner. This is the decisive objection: it converts a structural guarantee into a promise. Client-side encryption could restore it, but then the data is opaque, hand-editing is gone, and key management on a static site with no server is its own ADR. |
| **Terraform** | Yes, well: `google_firestore_database`, `google_firestore_index`, `google_firebaserules_ruleset`/`_release`, `google_identity_platform_config`. This is the option Terraform serves best. |
| **Migration effort** | New adapter (~200–300 lines), a new auth path (Firebase Auth instead of the GIS token flow), a one-off migration script, **and** a config-editor UI (D4). Call it a fortnight of evenings. |
| **Goals feature** | Trivial — a `goals` subcollection. No advantage over rows, because no goal query needs an index (§5.1). |
| **Bundle cost** | The killer for a project that advertises two runtime dependencies. Measured 2026-09-05 by downloading the prebuilt gstatic module bundles and gzipping them locally: **`firebase-firestore.js` v11.10.0 = 447 kB raw / ~116 kB gzipped; v12.18.0 = 667 kB raw / ~173 kB gzipped.** The whole current app is **93.8 kB gzipped, React included** — so Firestore alone is **1.2× to 1.8× the entire application**, to store 9 MB of text. `firebase-firestore-lite.js` is ~35–36 kB gzipped, but Firebase's own docs confirm it omits `onSnapshot` and the `enableIndexedDbPersistence` family — *"omits latency compensation, offline caching, query resumption and snapshot listeners"* ([Firestore Lite](https://firebase.google.com/docs/firestore/solutions/firestore-lite)) — i.e. it drops precisely the two features that would justify choosing Firestore. *(These are whole-module, non-tree-shaken builds and therefore an **upper bound**; a tree-shaken app import is smaller. Measure with `source-map-explorer` before quoting a final figure.)* |

### 4.3 Supabase (hosted Postgres + RLS + auth)

| | |
| --- | --- |
| **Browser-only client** | Yes. PostgREST over HTTPS, RLS for authorisation. `supabase-js` is ~40–60 kB gzipped, or you can skip it and call PostgREST with `fetch`, which suits this project's taste. |
| **Cost at this volume** | Free plan: **500 MB database**, shared CPU / 500 MB RAM, 5 GB egress + 5 GB cached egress, 1 GB file storage, 50 000 MAU, unlimited API requests, community support only. Pro **from $25/month**. Storage is a non-issue. |
| **The pausing policy** | **This disqualifies it.** Verbatim from the pricing page, checked 2026-09-05: *"Free projects are paused after 1 week of inactivity. Limit of 2 active projects."* ([supabase.com/pricing](https://supabase.com/pricing)) Restoring is a manual action. Daily use means it should never trigger — until the one week the owner is on holiday, comes back, opens the app to log the fortnight, and the database is asleep. For a *daily-habit* app, "your data store hibernates when you skip a week" is precisely backwards: **the app is most needed exactly when it has been neglected.** Avoiding it costs $25/month, i.e. **$300/year to store 9 MB.** |
| **Ops burden** | Moderate: migrations, RLS policies, key rotation, and the pause risk to monitor. |
| **Durability / backup** | Daily backups on paid plans; free-plan backups are limited. `pg_dump` yourself otherwise. |
| **Maintainer-blind** | **No.** Maintainer holds the `service_role` key and Postgres superuser. |
| **Terraform** | Partially — there is a community/official Supabase provider, but schema still wants a migration tool. Less clean than GCP-native. |
| **Migration effort** | New adapter + auth + schema + config UI. Similar to Firestore. |
| **Goals feature** | A `goals` table, naturally. Again no query that needs it. |

### 4.4 Cloud Run + real Postgres (Cloud SQL, or Neon)

| | |
| --- | --- |
| **Browser-only client** | Requires a server tier by definition — a REST API on Cloud Run. This is exactly the `adapters/rest/` box the architecture leaves empty, and exactly the "decision worth resisting" the roadmap flags. |
| **Cloud SQL cost — the surprise** | Cloud SQL has **no free tier** and bills an always-on instance. Derived from the published rates ([Cloud SQL pricing](https://cloud.google.com/sql/pricing), checked 2026-09-05, default region): the smallest shared-core Postgres tier `db-f1-micro` (shared vCPU, 0.6 GiB RAM) is **$0.0105/hour = $7.67/month**, plus the 10 GiB SSD minimum at $0.000232877/GiB-hour = **$1.70/month**. **Floor: $9.37/month ≈ $112/year**, before backups, egress, Cloud DNS and extended-support charges — and the page's own footnote adds *"Shared CPU machine types (db-f1-micro and db-g1-small) are not covered by the Cloud SQL SLA."* So the cheap tier is also the unsupported tier; the next rung up (`db-g1-small`, $0.035/hour) is **$25.55/month ≈ $307/year**. It does not scale to zero; there is no usage-based escape. *(us-central1 rates; **europe-west1 not verified**, and whether `db-f1-micro` is offered for PostgreSQL under the current editions model should be confirmed in the machine-types doc.)* **This is the surprise: a $112/year floor, without an SLA, to hold 9 MB.** |
| **Neon instead** | Much better shaped. Free: **0.5 GB storage and 100 CU-hours/month per project**, compute up to 2 CU, and it **scales to zero after 5 minutes of inactivity** — the property Supabase lacks, and the reason it does not share Supabase's disqualifying flaw. Paid entry is the usage-based **Launch** tier, typical spend **$15/month**, $0.106/CU-hour and $0.35/GB-month. ([neon.com/pricing](https://neon.com/pricing), checked 2026-09-05.) Cold starts of a few hundred ms are irrelevant for a once-a-session load. Still an external service that can change its terms, and still needs the API tier above it. |
| **Cloud Run cost** | Genuinely near-zero: 2 million requests/month free, min-instances 0, and this workload is ~500 requests/month. |
| **Ops burden** | **The highest of any option.** A container to build and keep patched, a database to migrate, IAM, a service account, secrets, a deploy pipeline, dependency updates on a server-side stack, and an auth story of the maintainer's own design. This is the option that generates 3am pages. |
| **Durability / backup** | Best-in-class if configured. That configuration is work. |
| **Security model** | Whatever the maintainer builds. Which is the problem: hand-rolled auth on a server holding one person's health record is a larger attack surface than the entire current design. |
| **Maintainer-blind** | **No, and worse than the others** — the data now transits a machine the maintainer literally operates, with logs. |
| **Terraform** | Excellent: `google_cloud_run_v2_service`, `google_sql_database_instance`, `google_secret_manager_secret`, `google_service_account`, Artifact Registry. This is the option Terraform makes prettiest, which is exactly the trap. |
| **Migration effort** | Largest. Adapter + API + schema + auth + config UI + CI/CD. |
| **Goals feature** | The only option where the relational model is actually used — and §5.1 shows nothing needs it. |

### 4.5 A single file in object storage (JSON, or SQLite, in GCS or Drive)

| | |
| --- | --- |
| **Browser-only client** | Yes for Drive (`drive.file` already covers a JSON blob the app created — no new scope, no new consent). GCS from a browser needs either signed URLs (⇒ a server) or a public/ACL'd bucket (⇒ not private) or Firebase Storage rules + auth. **Drive is strictly better than GCS here.** |
| **Cost** | Drive: €0, against the user's 15 GB free quota. GCS single-region Standard: **$0.000027397/GiB-hour ≈ $0.020/GiB-month**, Class A **$0.05/10 000** ops, Class B **$0.004/10 000** ops, and an always-free allowance of **5 GB-months plus 5 000 Class A and 50 000 Class B operations per month** — so 9 MB and ~500 writes/month is **$0**, indefinitely. ([Cloud Storage pricing](https://cloud.google.com/storage/pricing), checked 2026-09-05; default region, europe-west1 not verified.) The cost is not money, it is having a billing account attached to a personal project. |
| **Ops burden** | Drive: none. GCS: a bucket, IAM, a billing account. |
| **Concurrency and partial writes** | **This is the option's real content.** Writing the whole file every save has the same amplification as §3.1 with none of the benefits, and a mid-flight failure can truncate the *entire history* rather than one tab. Mitigation is write-new-object-then-swap plus Drive revision history or GCS object versioning — doable, but that is a hand-rolled transaction log. Concurrency across two devices is last-writer-wins at *whole-file* granularity, i.e. **strictly worse than Sheets**, where at least the loss is bounded to one tab (and to one day once §7.1 lands). Drive supports `If-Match`/ETag conditional updates, which turns silent loss into a detectable 412 — the right mitigation, and still work to write. |
| **SQLite WASM in the browser** | Fun, and **blocked on GitHub Pages**, which is the decisive part. Sizes measured from jsDelivr file listings 2026-09-05 (uncompressed): `sql.js` 1.14.2 `sql-wasm.wasm` **643 kB**; `wa-sqlite` 1.0.0 **545 kB** (async build 1 113 kB); official `@sqlite.org/sqlite-wasm` 3.53.0 `sqlite3.wasm` **844 kB** + `index.mjs` **565 kB** ≈ **1.4 MB**. Against a 297 kB raw / 93.8 kB gzipped app, that is several times the whole application, to run SQL over 110 000 rows a `Map` handles in single-digit milliseconds. **The hard blocker:** SQLite's own persistence doc states the `opfs` VFS requires `SharedArrayBuffer`, which requires the server to send `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` — *"Without these headers… the OPFS VFS will not load"* ([sqlite.org/wasm persistence](https://sqlite.org/wasm/doc/trunk/persistence.md)). **GitHub Pages cannot set response headers**, so the main OPFS VFS is unavailable to this deployment, full stop. The fallback `opfs-sahpool` VFS works without those headers but *"initialising it twice in the same origin+directory fails"* — i.e. it breaks in a second tab. OPFS is also worker-only, never the main thread. Add that Safari below 17 is incompatible with the `opfs` VFS outright. It buys query power the app does not need, costs the human-readability D5 protects, and cannot actually be deployed here. |
| **Maintainer-blind** | Drive: yes. GCS: no (maintainer owns the bucket). |
| **Terraform** | GCS yes (`google_storage_bucket`). Drive no, and does not need it. |
| **Migration effort** | Small for a Drive-JSON adapter (~120 lines, reusing `tabular.ts` verbatim), because it is the same shape as `localRepository`. |
| **Goals feature** | Fine. |
| **Verdict** | A *Drive-JSON* backend is the second-best option in this document, and the natural fallback if Sheets ever became unavailable. It loses D4 (no config editor in a spreadsheet ⇒ must build one) and D5/D6 (a JSON blob is not hand-editable by a normal human, and there is no free CSV export or share-with-my-GP menu item). Those losses are the whole reason it is second and not first. |

### 4.6 Local-first with sync (IndexedDB as source of truth + a sync layer)

| | |
| --- | --- |
| **Browser-only client** | IndexedDB is native, unlimited-ish, and — importantly for ADR 0002 — **readable by the service worker**, which `localStorage` is not. |
| **Cost** | €0 for the local half. The sync half costs whatever backend it syncs *to*, so this is not really an alternative to the others; it is a layer on top of one. |
| **How hard is sync, honestly** | Very. Not "a weekend" hard — "a category of bug you are still finding in eighteen months" hard: clock skew, tombstones, causality, partial failure, schema change mid-sync, and the fact that every bug in it is a *silent data-loss* bug in a multi-year health record. |
| **Is a CRDT library justified?** | **No.** A CRDT solves concurrent editing by multiple writers. Here there is one writer, on one or two devices, editing *different days* — the data is naturally partitioned by `(date, metric_id)` and conflicts are almost impossible by construction. Automerge/Yjs would add 100–200 kB gzipped and a new persistence format to solve a problem that does not occur. If concurrency ever does bite, the correct fix is 20 lines: last-write-wins per `(date, metric_id)` using the `updated_at` column **which already exists in the row layout** and is currently documented as "informational". That is the whole conflict-resolution story this app will ever need. |
| **Maintainer-blind** | Depends on the sync target. |
| **Migration effort** | Moderate for the IndexedDB store, unbounded for the sync layer. |
| **Verdict** | Rejected as an architecture. **Partially adopted as a tactic:** a small IndexedDB mirror of derived state is what makes ADR 0002's reminders work, and switching `localRepository` from `localStorage` to IndexedDB is independently worth doing (it removes the ~5 MB `localStorage` quota ceiling, which ~110 000 rows of JSON would eventually hit). That is not a sync layer. |

### 4.7 A git-backed store (commit CSV/JSON to a private repo via the API)

| | |
| --- | --- |
| **Why it is tempting** | Free, versioned, diffable, durable, plain text, the maintainer already lives in git, `git log` is an audit trail for free, and CSV in a private repo is genuinely a nice archival format. |
| **Browser-only client** | Possible: `PUT /repos/{o}/{r}/contents/{path}` with a PAT. Authenticated rate limit is **5 000 requests/hour**, ample. |
| **Where it breaks** | 1. **Auth.** GitHub has no browser-side OAuth flow without a server (the code-for-token exchange needs a client secret), so the user must paste a **long-lived Personal Access Token into the app and it must be stored** — replacing "a memory-only 1-hour token scoped to `drive.file`" with "a persistent credential at rest in the browser". A strict, significant security regression. 2. **The Contents API tiers on file size**: *"1 MB or smaller: All features of this endpoint are supported. Between 1-100 MB: Only the raw or object custom media types are supported… Greater than 100 MB: This endpoint is not supported."* ([REST contents API](https://docs.github.com/en/rest/repos/contents), checked 2026-09-05). A decade of entries is ~9 MB, so it lands in the degraded middle tier and wants the Git Trees/Blobs API and manual sharding. 3. **Every save is a commit**, so a year is ~5 000 commits of "update entries.csv" and the history becomes noise rather than signal — and GitHub's documented secondary rate limit is *"no more than 80 content-generating requests per minute and no more than 500 content-generating requests per hour"* ([rate limits](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api)), which is the real ceiling on frequent commits, not the 5 000/hour primary limit. 4. **Read-modify-write of a whole file** — same amplification as §3.1, plus SHA-conflict handling on every write. 5. **Not hand-editable on a phone**, which is where the app is used. |
| **Maintainer-blind** | Yes if the repo is the user's own. |
| **Verdict** | Rejected. Excellent as a *periodic backup target* (a monthly CSV commit is a lovely archive), bad as the live store. |

### 4.8 Options considered and judged noise

- **A KV store at the edge** (Cloudflare KV/D1, Deno KV, Val Town): all fail D1
  the same way Firestore does, and add a second vendor.
- **CouchDB/PouchDB replication**: the one genuinely elegant local-first answer,
  and it needs a CouchDB to operate (D2) plus ~50 kB of client.
- **WebDAV / Nextcloud / iCloud Drive**: same shape as Drive-JSON but the user
  has to run or buy something, and CORS is usually hostile.
- **Client-side-encrypted blob on any host**: restores D1 for any backend, and
  destroys D5 (hand-editable) and D6 (free export/sharing) in exchange. It also
  puts key management on a static site with no server, where the honest options
  are "a passphrase the user will forget" or "a key in `localStorage`, which is
  not really a key". Worth revisiting only if D1 must be preserved on a
  maintainer-owned backend — i.e. only if the status quo is abandoned.

**Honest summary of §4: this is a two-horse race between Google Sheets and a
Drive-JSON file, and everything else is noise for this problem.** The remaining
options are all variations on "acquire an operational burden and surrender the
privacy topology in exchange for query power and schema validation that a
few-thousand-row in-memory dataset does not need."

---

## 5. Does the goals feature change the answer?

**No — and this is now a measured fact rather than an opinion, because the data
layer is already written.**

### 5.1 The deciding question: is any query impossible in memory?

The goal model is:

```
Goal { id, label, metrics[], aggregate (count|sum|average|rate|streak),
       comparator (>=|<=|==|>|<), target, period (day|week|month|rolling),
       windowDays?, onlyWhen?, from, to?, tags[], color?, help?, active, order }
```

Goals are evaluated client-side over the already-loaded snapshot. Walk through
what each field actually demands of storage:

| Field | What storage has to do |
| --- | --- |
| `metrics[]` | Hold a list in one cell. Already solved: pipe-separated, exactly like `Config.tags`, via `splitList`. |
| `aggregate`, `comparator`, `period` | Hold one token from a small controlled vocabulary. Already solved three times over: `Config.type`, `Config.mode`, `Config.schedule`. |
| `target`, `windowDays`, `order` | Hold a number, comma-decimal tolerant. Already solved by the `min`/`max`/`order` parsing. |
| `onlyWhen` | Hold another metric's id. Already solved: `Config.depends_on` is exactly this, an id-valued soft reference resolved at load time. |
| `from`, `to` | Hold two `YYYY-MM-DD` strings. Already solved: `Events.start`/`Events.end`, including the "empty `end` means still open" convention. |
| `tags[]`, `color`, `help`, `active` | Verbatim `Config` columns. |

**Every single field is a column shape the format already has.** And the "change
a goal by closing the row with `to` and appending a new one" pattern is not
merely *possible* in a spreadsheet — it is what a spreadsheet is *best* at, and
it is the same append-a-row-to-preserve-history idiom the `Entries` tab and
`Config.active` already use.

Now the evaluation cost. The heaviest goal is a `rolling`/`streak` over ten years:

- Snapshot at 10 years: ~110 000 entries → `indexEntries` builds a
  `Map<date, Map<metricId, Entry>>` once, ~110 000 insertions, single-digit
  milliseconds.
- Evaluating 30 goals over 3 650 days: ~110 000 lookups against that `Map`.
  Sub-millisecond to a few milliseconds.
- Rolling windows are a sliding sum over a sorted date array. Linear.

**There is no goal query that cannot be answered in memory over the loaded
snapshot, and none that comes within three orders of magnitude of needing an
index.** No `GROUP BY` over data too large to hold, no join across tables the
client does not already have, no aggregate over a time range the client cannot
scan. The relational shape of the *model* is real; the relational shape of the
*workload* is not. Goals "sound relational" and that is the whole of the case for
a database.

### 5.2 The empirical evidence

The goals data layer is in the working tree as this ADR is written. `git diff
--stat`, 2026-09-05:

```
src/core/types.ts                       +76   the Goal type and its three unions
src/core/tabular.ts                     +96   HEADERS.goals (16 cols), parseGoals, goalToRow
src/core/repository.ts                  +12   saveGoal / deleteGoal on the seam
src/adapters/local/localRepository.ts   +26   one more tab, same idiom as notes/events
src/adapters/sheets/bootstrap.ts        +40   tab creation, column widths, dropdowns
src/adapters/sheets/sheetsRepository.ts +22   TabKey, TABS, TAB_KEYS, parseGoals, 2 methods
src/data/starter.ts + starterGoals.ts   +24   starter goal rows
src/core/form.ts, stats.ts, 2 screens   +12   type plumbing only
tests/ (5 files)                        +52
                                       ----
                                        337 insertions, 18 files
                                        1 new tab, 0 new dependencies, 0 new screens
```

Two lines of that are worth pointing at. The **entire** Sheets adapter change is
**+22 lines** — a `TabKey` union member, a `TABS` entry, a `TAB_KEYS` entry, a
`parseGoals` call in `fetchAll`, and two methods delegating to the existing
generic `upsertById`/`deleteById`. And `DashboardScreen.tsx` +2 /
`JournalScreen.tsx` +1 are type plumbing: **no goal-editing screen exists,
because the spreadsheet is the editor.**

Against that, the same feature on Firestore or Postgres costs those 337 lines
*plus* an adapter, *plus* a migration, *plus* — and this is the part that gets
underestimated — **a goals editor UI**. In a spreadsheet, "add a goal" is "type a
row"; the app needs no screen for it, no validation UI, no date pickers for
`from`/`to`, no metric multi-select, no aggregate dropdown. For calibration:
`JournalScreen.tsx` is **459 lines** to edit two entities with nine columns
between them. A screen covering `Config` (17 columns) + `Tags` (3) + `Goals` (16)
is credibly **800–1 500 lines**, against a current total UI of **3 615 lines**.

**Moving off Sheets does not cost a migration. It costs a config editor —
roughly a third of the existing UI, permanently, for no user-visible feature.**

### 5.3 Where goals genuinely strain the spreadsheet, in fairness

- **A 16-column row is at the edge of readable.** A goal row is denser than a
  `Config` row and a user will get `aggregate`/`comparator`/`period` wrong. The
  mitigation is cheap, spreadsheet-native, and **already implemented**:
  `bootstrap.ts` installs Sheets **data-validation dropdowns** on `aggregate`,
  `comparator` and `period` (part of the +40 above), warning rather than
  rejecting so a typo never blocks an edit mid-flow, plus per-column widths and
  the `Guide` tab. Google built that form for free. A hand-written React
  equivalent would be worse *and* cost four figures in lines.
- **No referential integrity.** `metrics[]` or `onlyWhen` can name a metric that
  does not exist. But this is not new — `Config.depends_on` and `tags` have the
  same exposure and the codebase already has the answer: resolve softly at load,
  drop what does not resolve (`typeEntries` already does exactly this for
  entries). A database's foreign key would turn a silently-ignored goal into a
  hard write failure, which for a personal tool is worse, not better.
- **Goal *results* have nowhere to live.** Correct, and correct by design: a
  goal's verdict is a pure function of `(goals, entries, date)` and must never be
  stored, or it goes stale the moment a past day is corrected. Recomputing is
  milliseconds. Nothing to store means nothing to migrate.

### 5.4 Answer

Goals do not move the decision one millimetre. If anything they strengthen it: the
feature landed in 337 lines and one tab precisely *because* the store is a
row-shaped, schema-light, human-readable table. The suspicion that "a spreadsheet
is no longer enough" is the right instinct applied to the wrong signal — the thing
that felt strained was the write amplification of §3.1, which is an adapter
implementation detail with a 30-line fix.

---

## 6. Decision

**Keep Google Sheets as the primary backend. Do not add a database. Fix the write
amplification inside the existing adapter, and add goals as a `Goals` tab.**

Reasons, in order of weight:

1. **It is the only option that satisfies D1 structurally.** Every
   maintainer-hosted alternative replaces "cannot see the data" with "promises not
   to look", and that is the project's stated best property. The only alternative
   that preserves D1 is Drive-JSON, which is a worse Sheets.
2. **It is the only option with genuinely zero ops (D2) and no cost floor (D3).**
   Cloud SQL's ~€130/year floor for 9 MB and Supabase's 7-day pause are the two
   concrete traps, and both were found by looking rather than guessing.
3. **Moving costs a config editor (D4), ~800–1 500 lines, permanently.** No
   alternative offers a user-visible feature in exchange.
4. **The dataset is three orders of magnitude too small to need any of it.** The
   heaviest goal evaluation over a decade of data is a few milliseconds of `Map`
   lookups.
5. **The one real problem is fixable where it lives**, in ~30 lines of adapter,
   with no new dependency and no new infrastructure.
6. **A database would have to be justified by a query, and there is no query.**

Secondary decisions:

- **Do not build `adapters/rest/`** for now. Lot 5 of the roadmap stays as the
  hypothesis-keeper it says it is.
- **Switch the local backend from `localStorage` to IndexedDB** when convenient.
  It removes the ~5 MB `localStorage` ceiling that a decade of rows would hit, and
  ADR 0002 needs an IndexedDB mirror anyway. Independent of this decision.
- **Add a periodic CSV backup to a private git repo** if the owner wants belt and
  braces (§4.7 is good at that job, just not as the live store). Optional.

---

## 7. Consequences

### 7.1 Immediate follow-up work — the write-amplification fix

Not optional; this is the part of the decision that earns keeping the status quo.
Replace whole-tab rewrite with **append + tombstone**, then compact rarely.

Why it works with **zero changes to the reading side**:

- `indexEntries` already documents "Later rows win: an append-only backend keeps
  the newest correction last."
- `parseValue(metric, '')` already returns `null`, and `null` already means "not
  answered". **An appended row with an empty `value` cell is therefore already a
  valid tombstone**, needing no new concept, no new column and no format change.

So `saveDay` becomes: append this day's ~30 rows (plus an empty-value row for each
answer the user cleared) via `values:append`. Cost per save: **~30 rows, ~2.4 kB,
constant forever** — down from 8.8 MB at year 10, a **~3 500×** reduction.
Compaction (the current whole-tab rewrite, reused verbatim) runs at most once when
`rows > 3 × distinctDays × metrics`, or on an explicit "tidy up" button.

Side benefits: a concurrent hand edit to a *different* day now survives (§3.3),
and hand-added extra columns on untouched rows survive too — which retires
another open roadmap item.

`Notes`, `Events`, `Config` and `Goals` keep the whole-tab rewrite. They are tens
of rows; the amplification argument does not apply and the simpler code is worth
more.

**One runnable check is the acceptance criterion:** save a day, clear one answer,
re-save, reload, and assert the snapshot matches the local adapter's for the same
sequence. `localRepository` is the reference implementation; if the two disagree,
the append scheme is wrong.

### 7.2 Good

- Nothing new to operate, provision, patch, pay for or un-pause. €0/month with no
  cliff and no billing account required.
- The privacy claim stays true by construction. The README's "the author cannot
  see your data … by construction rather than by promise" needs no softening.
- Data stays human-readable, hand-editable, freely backed up (Drive revisions),
  freely exportable (CSV), and freely shareable with a doctor for a week.
- No config-editor UI is required — for goals either. The roadmap's "deliberately
  last" stays deliberate.
- The `HabitRepository` seam stays honest: two implementations, both tested, and
  the local one is still the reference.
- After §7.1, per-save payload is flat for the life of the project.

### 7.3 Bad — accepted with eyes open

- **Concurrent edits are still last-writer-wins**, now at day granularity rather
  than tab granularity. Wrong for anything multi-user; right here. The
  `updated_at` column is the 20-line upgrade path if it ever bites.
- **`load()` still downloads everything.** ~9 MB of JSON at year 10 (less on the
  wire, gzipped) once per session. Acceptable; if it ever is not, the fix is a
  bounded read of the last N months plus lazy history, not a new backend.
- **A hard dependency on Google.** If Google retires the Sheets API or changes
  `drive.file`, the app needs a new backend. Mitigated by the seam existing and by
  Drive-JSON being a ~120-line fallback.
- **`drive.file` means the app must create the file**, so a user cannot point it
  at an existing spreadsheet. Already documented; occasionally confusing.
- **Nothing can read the data in the background.** No token outside a live tab.
  This is a direct constraint on ADR 0002 and the reason reminders must decide
  locally.
- **The `Goals` tab will get typos.** Data-validation dropdowns and soft
  resolution, not a schema.
- **`Entries` grows unbounded until compaction**, adding one operation the user
  can be asked to run. Small, visible, reversible.

---

## 8. Migration trigger

Revisit this ADR when **any one** of these becomes observably true. Not "when it
feels big" — these are meant to be checkable.

**Volume and performance**

1. `Entries` exceeds **250 000 rows** *after* compaction, or `load()` takes more
   than **5 seconds** on a warm mobile connection. (Roughly year 23 at the
   current rate; if the answer rate rises tenfold, roughly year 2.)
2. Total cells in the spreadsheet exceed **5 000 000**, i.e. half the 10 M hard
   limit. (Currently ~114 years away.)
3. A single `saveDay` payload exceeds **2 MB** *after* §7.1 lands. That would mean
   the append scheme has a bug, and the bug is the thing to fix.

**Quota and platform**

4. HTTP 429 from the Sheets API is seen more than once a month in normal use with
   correct backoff.
5. Google restricts `drive.file`, requires verification for it, or changes the
   Sheets API in a way that breaks the adapter.

**Requirements**

6. **A second human needs their own data in the same deployment.** This is the
   real trigger, and it flips almost every driver at once: D1 becomes a
   multi-tenant isolation problem, D4 becomes mandatory, and the roadmap's "no
   hosted multi-user service" would have to be rewritten first. This is a
   different product, not a backend change.
7. A feature is specified that needs a query **that cannot be answered in memory
   over the loaded snapshot** — full-text search across a decade of notes with
   ranking, or cross-metric correlation over a window too large to hold. Note
   that the two currently-planned candidates (roadmap: full-text note search,
   metric correlations) both *can* be done in memory over a few thousand rows, so
   neither trips this.
8. Reliable multi-device concurrent editing becomes a requirement — meaning a
   real conflict has actually caused data loss, twice, not that it is
   theoretically possible.
9. Server-side scheduled evaluation of goals is wanted (e.g. a nightly email
   digest). Note this trips **D1** before it trips anything technical, and ADR
   0002 exists precisely to avoid it.

**If a trigger fires, the ordered candidate list is:**

1. **Drive-JSON or Drive-SQLite** — keeps D1, D2, D3 and most of D6; loses D4 and
   D5. ~120 lines. Best answer to triggers 1–3 and 5.
2. **Firestore with client-side encryption** — keeps D1 at the cost of D5/D6.
   Best answer to triggers 7–8.
3. **Cloud Run + Neon** — only if trigger 6 or 9 fires, i.e. only once the
   product has actually changed. Never for performance reasons; the numbers in §1
   do not support it and will not for decades.

**Explicitly not a trigger:** the goals feature; a new field type; a new
statistic; a chart; the dataset "feeling large"; the availability of a nice free
tier; or the aesthetic discomfort of storing structured data in a spreadsheet.

---

## 9. Verification status of the figures in this document

Measured locally on 2026-09-05, reproducible:

- Bundle: 297 kB raw / **93.8 kB gzipped** (`gzip -c dist/assets/index-*.js | wc -c`).
- Goals data layer: **337 insertions** across 18 files, of which +22 in the Sheets
  adapter and 0 new UI screens (`git diff --stat`).
- UI totals: **3 615 lines**, `JournalScreen.tsx` **459 lines** (`wc -l`).
- Row byte counts and payload sizes: arithmetic over the actual `entryToRow`
  output shape.

Verified against primary documentation on 2026-09-05:

| Fact | Source |
| --- | --- |
| Sheets API quotas (300/min project, 60/min/user, read and write), no daily cap, batch counts as one request, 2 MB payload recommendation, 180 s request timeout | [Sheets API usage limits](https://developers.google.com/workspace/sheets/api/limits) (page last updated 2026-07-31) |
| Sheets hard limit: "Up to 10 million cells or 18,278 columns (column ZZZ)" | [Google Drive file limits](https://support.google.com/drive/answer/37603) |
| Firestore free quota (50 k reads / 20 k writes / 20 k deletes per **day**, 1 GiB, 10 GiB/mo egress, one free database per project) and unit prices | [Firestore pricing](https://cloud.google.com/firestore/pricing) |
| Firestore Lite omits `onSnapshot` and the `enableIndexedDbPersistence` family | [Firestore Lite](https://firebase.google.com/docs/firestore/solutions/firestore-lite) |
| Cloud SQL `db-f1-micro` $0.0105/h, SSD $0.000232877/GiB-h, shared-core **not covered by the SLA** | [Cloud SQL pricing](https://cloud.google.com/sql/pricing) |
| Supabase: 500 MB free DB, **"Free projects are paused after 1 week of inactivity"**, Pro from $25/mo | [supabase.com/pricing](https://supabase.com/pricing) |
| Neon: 0.5 GB + 100 CU-hours/project free, scale to zero after 5 min, Launch ~$15/mo | [neon.com/pricing](https://neon.com/pricing) |
| GCS Standard $0.020/GiB-mo, op prices, always-free 5 GB-mo + 5 k Class A + 50 k Class B | [Cloud Storage pricing](https://cloud.google.com/storage/pricing) |
| GitHub Contents API 1 MB / 1–100 MB / >100 MB tiers | [REST contents API](https://docs.github.com/en/rest/repos/contents) |
| GitHub secondary limit: 80 content-generating requests/min, 500/hour; 5 000/hour authenticated primary | [REST rate limits](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api) |
| SQLite WASM `opfs` VFS requires COOP/COEP headers; `opfs-sahpool` fails when initialised twice per origin; OPFS is worker-only | [sqlite.org/wasm persistence](https://sqlite.org/wasm/doc/trunk/persistence.md) |

Measured 2026-09-05 rather than quoted: Firebase `firebase-firestore.js` v11.10.0
447 kB raw / ~116 kB gzip and v12.18.0 667 kB raw / ~173 kB gzip (whole-module
gstatic builds, gzipped locally — an **upper bound**, not a tree-shaken figure);
`sql.js` / `wa-sqlite` / `@sqlite.org/sqlite-wasm` file sizes from jsDelivr
listings.

**Marked as unverified / re-check before relying on them:**

- **All GCP prices above are the pricing pages' default region (us-central1).**
  The per-region tables are rendered by JavaScript, so `europe-west1` / `eur3`
  figures were **not** obtainable and are **not** verified. Re-derive with the
  pricing calculator before putting a European figure in a README.
- Whether `db-f1-micro` is still offered for **PostgreSQL specifically** under
  the current Cloud SQL editions model (the pricing page groups MySQL and
  PostgreSQL together).
- Sheets' maximum row count and maximum number of tabs per spreadsheet — the
  help page states neither; rows are effectively bounded by the 10 M-cell ceiling.
- Tree-shaken Firestore bundle size in this app's actual build.
- Whether GitHub Pages is *suitable* for frequent commits: GitHub documents no
  position either way. The 80/min-500/hour secondary limit and the 10-builds/hour
  Pages soft limit (which does not apply when publishing via a custom Actions
  workflow, as this repo does) are the governing constraints; the inference is
  mine, not GitHub's.

None of the unverified figures changes the decision: the argument turns on D1
(privacy topology), D2 (nothing to operate) and D4 (no config editor), and the
prices only make the rejected options *worse*. Where a verified figure moved a
number, it moved it against the alternative — Firestore's real bundle is bigger
than the estimate, and Cloud SQL's cheap tier turns out to have no SLA.
