# ADR 0004 — A reusable self-hosted platform, not one app's backend

- **Status:** proposed
- **Date:** 2026-09-13
- **Deciders:** the owner (single operator, single user today)
- **Related:** [ADR 0001 — Where the data lives](0001-data-backend.md),
  [ADR 0002 — Reminders](0002-reminders.md),
  [ADR 0003 — Should MyHabits move to a BaaS?](0003-baas.md)
- **Scope:** this ADR is **not** about MyHabits' backend. ADR 0003 decided that.
  This is about the substrate MyHabits and projects 2…N run on, and it judges
  every option on one test: **does it still hold at project four?**

The question, in substance: *"I'd like to imagine an infrastructure I can
replicate for other projects. We'll always want secure data (plus backups) and
authentication. Ideally self-hosted, but secure enough not to scare us. Can
PocketBase do the job?"*

---

## 0. The verdict, in fifteen lines

| Question | Answer |
| --- | --- |
| **PocketBase as *this app's* backend?** | **No — and ADR 0003 §4/§5 still stands**, on three MyHabits-specific grounds: no record CSV import ([#48](https://github.com/pocketbase/pocketbase/issues/48)), admin UI explicitly not mobile ([#3803](https://github.com/pocketbase/pocketbase/issues/3803)), no EC crypto in the JS VM so VAPID Web Push needs a custom Go binary or a second container. |
| **Do those objections generalise to project 2, 3, 4?** | **No, and this ADR says so explicitly.** All three are artefacts of *this* app (a generate-and-paste TSV config workflow, a phone-only admin, RFC 8291 push). A project without them would not trip any of the three. Do not re-use ADR 0003's verdict as a general one. |
| **PocketBase as a *reusable platform*?** | **Also no — but for a completely different and more durable reason.** It is not a platform at all; it is a **per-project BaaS**. It cannot be your identity provider ([#1144](https://github.com/pocketbase/pocketbase/discussions/1144): *"no plans to allow using PocketBase as OAuth2 provider"*), so it cannot authenticate anything that is not PocketBase. At project four you operate four of them. |
| **Is PocketBase a *good product*?** | **Yes, genuinely** — best-in-class free backup story, 32 OAuth2 providers, one static MIT binary, same-day security releases, and your data is a plain SQLite file that outlives the software. If you ever want *one* app with its own users and its own admin, reach for it. |
| **The bus factor** | **998 of the last ~1000 commit-author slots are one person** (measured via the GitHub API, 2026-09-13). Donations are refused by policy; the one grant was cancelled. The FAQ: *"There are no promises for maintenance and support beyond what is already available."* Ten years is ~2.5× the project's life so far. |
| **So what?** | **Pattern B: authenticate once at the edge, back up once over all volumes, and make every project a dumb container + a volume.** Recommended stack in §8, decision in §11. |

**The one-sentence version:** *PocketBase is a fine app backend and a bad platform,
because a platform's job is to be shared and PocketBase's auth cannot be shared.*

---

## 1. The fork this document exists to resolve

Conflating these two shapes is the main way this question gets answered badly.

| | **Pattern A — per-project BaaS** | **Pattern B — shared platform, dumb tenants** |
| --- | --- | --- |
| Shape | Each project = one container carrying its own DB, auth, users, admin UI | Auth lives **once** at the edge; backups live **once** as an agent over all volumes; each project is a container + a volume with **zero auth code** |
| Examples | PocketBase, Appwrite, Directus, Supabase self-hosted, Nhost | Caddy `forward_auth` + Authelia / Authentik / Pocket ID / Tinyauth, + restic |
| Day 1 | **Fast.** One image, done in an evening. | Slower. You configure a thing that serves nothing yet. |
| Project 4 | 4 auth systems, 4 user tables, 4 upgrade cycles, 4 backup configs, 4 password resets | 1 auth system, 1 user list, 1 upgrade cycle, 1 backup job. Project 4 adds **6 lines of compose and 4 lines of Caddyfile**. |
| Marginal cost of project N | ~constant and non-trivial | ~zero |
| Blast radius of one CVE | 1 project | all projects (honest downside) |
| Second human | N user tables to create the account in | one account, everywhere |

### 1.1 The arithmetic, because that is the whole argument

Ops work is roughly `fixed + n × per_project`. What matters is not the fixed cost,
it is the slope.

| | fixed | per project | at n=1 | at n=4 |
| --- | --- | --- | --- | --- |
| **Pattern A** (PocketBase per project) | ~0 | 1 upgrade cycle + 1 backup config + 1 user record + 1 admin UI to remember | 1 unit | **4 units** |
| **Pattern B** (Authelia + restic) | 1 auth service + 1 backup agent | ~0 (a Caddy block, a volume path) | ~2 units | **~2 units** |

They cross at **n = 2**. Not n = 10, not n = 4 — **two**. The premise of the
question ("an infrastructure I can replicate") already puts him past the crossing
point on day one.

### 1.2 The condition under which Pattern A wins anyway

Be fair to it. **Pattern A wins if any of these is true:**

1. **There will genuinely only ever be one project.** The question's own framing
   denies this, but if a year from now there is still exactly one, Pattern B's
   fixed cost was wasted.
2. **The projects share no users and must share no failure domain.** One shared
   Authelia means one shared outage and one shared CVE. If two projects have
   genuinely different audiences, the shared edge is a liability, not an asset.
3. **A project needs record-level authorisation, not app-level.** Forward-auth is
   a door: it answers *"may this person in?"*, never *"may this person see row
   17?"*. An app that genuinely needs the second (multi-tenant, sharing, roles)
   needs something like PocketBase's API rules or Postgres RLS **inside** it.
   For one person answering one form a day (ADR 0003 §3.4), that is moot.

**None of the three holds here.** Pattern B.

### 1.3 Pattern A½ — "one PocketBase, many collections" — and why it fails

The tempting hybrid: one PocketBase instance, collections namespaced per project,
one shared `users` collection. One auth, one backup, one upgrade. It is genuinely
Pattern B *for PocketBase-shaped projects*.

It fails on one verified fact: **PocketBase cannot authenticate anything that is
not PocketBase.** It is an OAuth2/OIDC *consumer* (32 providers, including a
generic `oidc.go`), never a *provider*
([discussion #1144](https://github.com/pocketbase/pocketbase/discussions/1144),
maintainer: *"this is not possible at the moment and at least for v1 there are no
plans to allow using PocketBase as OAuth2 provider since it will complicate too
much the API"*, checked 2026-09-13). So the day project 3 is an off-the-shelf
container — a wiki, a photo library, a bookmark manager — it gets no auth from
your platform and you are back to Pattern A. Secondary problems: every project
shares one SQLite file and one upgrade window, and a v0.x breaking change lands on
all of them at once.

---

## 2. PocketBase, in depth

Deepest treatment because it is the named candidate. Everything below is
primary-sourced and checked **2026-09-13**.

### 2.1 What it is today

| Fact | Value | Source |
| --- | --- | --- |
| Latest release | **v0.40.4**, 2026-09-12 | [releases API](https://api.github.com/repos/pocketbase/pocketbase/releases/latest) |
| v1.0 reached? | **No**, after 4+ years (repo created 2022-07-05) | [repo API](https://api.github.com/repos/pocketbase/pocketbase) |
| Stars / open issues | 61 029 / 19 | same |
| Licence | **MIT** | same |
| Stability disclaimer | *"full backward compatibility is not guaranteed before reaching v1.0.0"* | [README](https://github.com/pocketbase/pocketbase) |
| Stronger disclaimer | *"PocketBase is **NOT recommended for production critical applications yet**, unless you are fine with reading the changelog and applying some manual migration steps from time to time."* | [docs](https://pocketbase.io/docs/) |
| v1.0 ETA | *"There are no ETAs. This is a hobby project and I don't want to make promises."* | [#4036](https://github.com/pocketbase/pocketbase/discussions/4036) |

### 2.2 Maintainers — the fact that decides the platform question

Measured against the GitHub API on 2026-09-13:

| Contributor | Commits (all time) | Commits (last 12 months) |
| --- | --- | --- |
| `ganigeorgiev` | **2 482** | **998** |
| next human (`ValleyZw`) | 5 | — |
| everyone else combined | ~25 | 1 |

The author's own framing ([FAQ](https://pocketbase.io/faq/)): *"PocketBase is
neither a startup, nor a business. There is no paid team or company behind it…
**There are no promises for maintenance and support beyond what is already
available**."* Donations are refused by policy (*"financial contributions from
individuals usually comes with some 'unspoken expectations'"*), `.github/FUNDING.yml`
is a 404, and the single grant attempt was cancelled
([#7287](https://github.com/pocketbase/pocketbase/discussions/7287)).

For contrast, same measurement, same day — top contributors by commits: **restic**
fd0 3995 / MichaelEischer 3548 / rawtaz 250; **Authelia** james-d-elliott 1710 /
clems4ever 803; **Pocket ID** stonith404 950 / kmendell 135 / ItalyPaleAle 114;
**oauth2-proxy** JoelSpeed 701 / jehiah 207 / tuunit 147; **Authentik** BeryJu 9066
plus a company. Only **Tinyauth** (638 vs 10) matches PocketBase's shape, and
PocketBase's ratio is ~500:1.

### 2.3 Upgrade risk — 0.x means what it says

The most recent minor, **v0.40.0 (2026-08-23)**, shipped two behaviour changes the
author flags himself: a CLI exit-status change, and Go 1.27's `encoding/json` v2
retrofit — *"unfortunately is not fully backward compatible… I recommend to not
push blindly an update on production and to test your PocketBase application first
locally"* ([CHANGELOG](https://raw.githubusercontent.com/pocketbase/pocketbase/v0.40.4/CHANGELOG.md)).
v0.40.3 changed the JS VM's `$app` from a type to an interface.

The last big one is the calibration point. From the
[v0.23 upgrade guide](https://pocketbase.io/v023upgrade/go/): *"there is no easy
and automated code upgrade solution so be prepared because it might take you some
time — **from 1h to entire weekend!**"*

Mitigation that exists: a backported **0.22.x line** still receiving fixes
(v0.22.55, 2026-09-06). Pinning to it buys stability and freezes features.
**NOT VERIFIED:** any stated support window or LTS commitment for that line.

### 2.4 Backups — genuinely the best free story in this document

| Aspect | Verified behaviour |
| --- | --- |
| What it captures | *"a full snapshot as ZIP archive of your `pb_data` directory (including the locally stored uploaded files but **excluding any local backups or files uploaded to S3**)"* ([docs](https://pocketbase.io/docs/going-to-production/)) |
| Target | local (default) or **S3-compatible**; *"recommended to use a separate bucket only for the backups"* |
| Schedule / retention | `BackupsConfig{ Cron, CronMaxKeep, S3 }` — a cron expression plus a keep-count, default **3**; retention applies **only to cron-generated backups** ([`core/settings_model.go` @ v0.40.4](https://raw.githubusercontent.com/pocketbase/pocketbase/v0.40.4/core/settings_model.go)) |
| **Restore** | **Yes, a one-call operation:** `POST /api/backups/{key}/restore` — *"Restore a single backup by its name and **restarts the current running PocketBase process**"* ([Backups API](https://pocketbase.io/docs/api-backups/)). Needs a supervisor, or it stays down. |
| Manual path | *"To backup/restore your application it is enough to manually copy/replace your `pb_data` directory (**for transactional safety make sure that the application is not running**)"* |
| Caveats | *"during the backup the performance could be slightly degraded"*; for `pb_data` ≥ 5 GB the docs advise a different strategy (`sqlite3 .backup` + `rsync`). Backup failures email the superuser since v0.39.0. |

**NOT VERIFIED:** whether the built-in backup uses a consistent SQLite snapshot
(`VACUUM INTO` / backup API) or a file copy; whether restoring an S3 backup onto a
*fresh* instance is documented; any `pocketbase restore` CLI subcommand. Disaster
recovery from a dead host therefore falls back to "stop, replace `pb_data`" — which
is documented, and is a one-liner, but is not the dashboard button.

### 2.5 Auth, authorisation, realtime, files

| | Verified |
| --- | --- |
| Password | Yes; identity field configurable (any UNIQUE field) |
| OAuth2 | **32 provider implementations** in [`tools/auth` @ v0.40.4](https://github.com/pocketbase/pocketbase/tree/v0.40.4/tools/auth), including a generic `oidc.go` — so Authelia/Authentik/Keycloak work **as the IdP** |
| Email OTP | Yes; default 3 min / 8 chars. Docs warn it is *"less secure… risk of it being guessed or enumerated"* |
| MFA | Yes since v0.23 — *"requires the user to authenticate with any 2 different auth methods"*, i.e. from {password, OAuth2, email-OTP}. **No TOTP authenticator app, no SMS.** |
| **Passkeys / WebAuthn** | **Not supported.** [#6800](https://github.com/pocketbase/pocketbase/issues/6800) open since 2025-05-06, sitting in the roadmap Backlog |
| **OIDC provider** | **No** — consumer only ([#1144](https://github.com/pocketbase/pocketbase/discussions/1144)) |
| Sessions | *"fully stateless… even the tokens are not stored in the database"*, *"there is also no logout endpoint"*. **Default auth token 5 days** (`AuthToken: 432000`), configurable up to ~3 years. **No per-token revocation**: you can only rotate a password (kills that user's tokens) or the collection secret (kills everyone's). |
| Authorisation | Five rule strings per collection (`listRule`…`deleteRule`) with a filter grammar over `@request.*` and `@collection.*`. No roles/scopes primitive; no field-level read rules; **rules are UI-edited strings stored in the DB**, not code — not type-checked, not unit-testable, and a fat-finger silently widens access |
| Realtime | **SSE** ([API](https://pocketbase.io/docs/api-realtime/)); `COLLECTION/*` gated by ListRule, `COLLECTION/ID` by ViewRule |
| Files | local `pb_data/storage` or S3. **Public-by-URL unless the field is marked Protected** — audit this first for health data ([files handling](https://pocketbase.io/docs/files-handling/)) |

### 2.6 SQLite on one node

Official [FAQ](https://pocketbase.io/faq/): *"Does it scale? Only on a single
server, aka. vertical… PocketBase can easily serve 10 000+ persistent realtime
connections on a cheap $4 Hetzner CAX11 VPS"*, and *"If you need replication and
disaster recovery, a great companion app could be Litestream."* Connection model
([#4209](https://github.com/pocketbase/pocketbase/discussions/4209)): WAL, two
pools, ~120 concurrent readers, exactly **one** writer. **NOT VERIFIED:** any
stated ceiling in rows, bytes, or users. Against ~11 000 rows/year (ADR 0001 §1.1)
this is not a constraint in this century.

One documented trade-off worth writing down: *"To avoid DB locks PocketBase
deliberately tries to minimize the use of DB transactions… this can technically
lead to a race condition if multiple users edit the same record. This is an
accepted tradeoff"* ([SECURITY.md](https://github.com/pocketbase/pocketbase/blob/master/.github/SECURITY.md)).

### 2.7 Security track record

Three advisories in ~4 years. Response is fast; indexing is not.

| ID / CVE | Sev | What | Fixed in | Date |
| --- | --- | --- | --- | --- |
| [GHSA-m93w-4fxv-r35v](https://github.com/advisories/GHSA-m93w-4fxv-r35v) / CVE-2024-38351 | Moderate 5.4 | Password + OAuth2 unverified-email linking → account takeover | 0.22.14 | 2024-06-18 |
| [GHSA-pq7p-mc74-g65w](https://github.com/advisories/GHSA-pq7p-mc74-g65w) / CVE-2026-44166 | Moderate 6.1 (GitHub) / **High 7.6 (NVD)** | Account **pre-hijacking** via OAuth2 unverified→verified autolink upgrade; prior links not cleared | 0.22.42, 0.37.4 | 2026-04-27 |
| [GHSA-84vh-m24q-wjjx](https://github.com/pocketbase/pocketbase/security/advisories/GHSA-84vh-m24q-wjjx) / CVE-2026-82410 | **High 8.7** | Unhandled panic in worker goroutines → server process termination (availability only) | 0.22.48, 0.39.7 | 2026-07-16 |

Two observations that matter more than the count:

- **Two of three are the same class of bug** — OAuth2 email-autolinking account
  takeover — recurring 22 months apart. That is the signature of a single reviewer.
- **The High-severity one is not in NVD or OSV** as of 2026-09-13 (`cveId=CVE-2026-82410`
  returns `total: 0`). **A CVE-feed scanner would have missed it.** You must watch
  the repo's own advisories page.

The policy is honest and fast: *"I try to be as responsive as possible and usually
address security issues within couple days"*, with a ~24 h pre-announcement then a
same-day release, backported to 0.22.x. It also says plainly: *"there is no such
thing as JSVM 'sandboxing' in PocketBase"* and *"there are no bounties"*.

### 2.8 Behind a TLS-terminating proxy

Documented and simple: run `--http=127.0.0.1:8090`, let the proxy do TLS, and set
*"User IP proxy headers"* so the real client IP is extracted
([going-to-production](https://pocketbase.io/docs/going-to-production/)). The
config is an **allowlist of header names plus a leftmost/rightmost toggle**, with an
explicit spoofing warning in the source — **there is no CIDR allowlist of trusted
proxy addresses**. Since the rate limiter and the superuser IP whitelist both key
off the extracted IP, getting this wrong makes both spoofable. Bind to loopback.

### 2.9 The honest verdict, and the exit

**As an app backend:** good, with named gaps (no passkeys, no TOTP, 5-day
unrevocable tokens, UI-string authorisation). ADR 0003's rejection was correct for
*this* app and does not generalise.

**As a platform:** no. Not because of §2.2 — a single maintainer is survivable when
the artefact is this simple — but because **it has nothing to share**. No IdP, no
forward-auth endpoint, no cross-project anything.

**Is one maintainer acceptable for a decade of health data?** For the *data*, yes,
and this is the strongest thing in PocketBase's favour: MIT, one static binary,
plain SQLite in `pb_data`. If the author stops tomorrow, the last binary keeps
running, and your records are a `.db` file any tool can open. **The exit is
`sqlite3 pb_data/data.db .dump`.** For the *auth*, no — an unreviewed auth
codebase with a 5-day unrevocable token, exposed to the internet, is exactly the
thing you should not own. Which is the argument for Pattern B, not against
PocketBase.

---

## 3. Pattern A alternatives — one paragraph each

Container counts and RAM floors from the projects' own installers, 2026-09-13.

| Option | Footprint | Why not, in one line |
| --- | --- | --- |
| **Supabase self-hosted** | **7 core containers** (Studio, Kong, GoTrue, PostgREST, Realtime, Storage, Postgres) + Logflare + Vector; **4 GB RAM minimum** ([docs](https://supabase.com/docs/guides/self-hosting/docker), via ADR 0003 §6.2) | Nine daemons to store 9 MB for one person. No auto-backups, no PITR, manual upgrades and TLS. ADR 0003 called it the worst option in that document and nothing here changes it. |
| **Appwrite** | **~40 services** in the official `docker-compose.yml` on `main` (39 enumerated 2026-09-13: traefik, 20 workers/schedulers, clickhouse, **mariadb + mongodb + postgresql**, redis, …); stated minimum **2 CPU / 4 GB RAM / 2 GB swap** ([install docs](https://appwrite.io/docs/advanced/self-hosting/installation)). v2.1.0, BSD-3, 57 363 stars | Supabase's profile with a heavier footprint. This corrects ADR 0003's "~15–20 containers, NOT VERIFIED" — it is worse than that. |
| **Directus** | v12.3.1 (2026-08-25), 37 891 stars; supports SQLite; the best admin app on this list; a native mobile app | Licence moved to MSCL in v12 (May 2026) — free under $5 M revenue, GPLv3 after four years; a licence that changed structurally this year can change again. And it sits *in front of* a database, so it is always Directus **plus** the app. |
| **Nhost** | Postgres + Hasura + auth + storage + functions | GraphQL is pure cost for a client that loads everything in one round trip (ADR 0003 §6.4). Out. |

**None of the four changes the Pattern A arithmetic in §1.1.** They change the
constant, not the slope.

---

## 4. Pattern B — the edge auth layer

This is where the study earns its keep. All figures checked **2026-09-13**.

### 4.1 The candidates

| | **Authelia** | **Authentik** | **Pocket ID** | **Tinyauth** | **oauth2-proxy** | **Caddy `basic_auth`** |
| --- | --- | --- | --- | --- | --- | --- |
| Version | v4.39.26 (2026-09-12) | 2026.8.2 (2026-09-09) | v2.14.0 (2026-08-18) | v5.2.0 (2026-09-07) | v7.15.4 (2026-08-20) | built in |
| Licence | Apache-2.0 | custom (`NOASSERTION`) | BSD-2 | **AGPL-3.0** | MIT | Apache-2.0 |
| Stars | 28 948 | 25 479 | 9 181 | 8 247 | 14 950 | — |
| Bus factor | 2+ humans | 1 human + a company | 3 humans | **1 human** (next: 10 commits) | 3+ | Caddy team |
| **Containers (min)** | **1** — YAML users file, SQLite storage, in-memory sessions | **3** (`postgresql`, `server`, `worker` in the [official compose](https://goauthentik.io/docker-compose.yml)) | 1 | 1 | 1 (+ an IdP) | **0** |
| RAM floor | not stated; single Go binary | **"at least 2 CPU cores and 2 GB of RAM"** ([docs](https://docs.goauthentik.io/install-config/install/docker-compose/)) | not stated | not stated | not stated | 0 |
| Password | yes (argon2 default, [file provider](https://www.authelia.com/configuration/first-factor/file/)) | yes | **no — passkey only** | yes | delegated | yes (bcrypt) |
| TOTP | yes | yes | n/a | yes | delegated | no |
| **Passkeys** | **yes**, incl. first-factor via `enable_passkey_login` ([docs](https://www.authelia.com/configuration/second-factor/webauthn/)) | yes | **yes, only** | NOT VERIFIED | delegated | no |
| **OIDC provider** | **yes, but "open beta"** ([docs](https://www.authelia.com/configuration/identity-providers/openid-connect/provider/)) | **yes**, mature | **yes, OpenID Certified™** | **yes, OpenID Certified™ Basic OP since v5.1.0 (2026-06-25)** | **no — consumer only** | no |
| **forward-auth gate** | yes, `/api/authz/forward-auth` | yes | **no** (IdP only) | yes | yes | n/a |
| Caddy integration | **official Caddy example in Caddy's own docs** | documented | via a gate | documented | documented | native |
| **Unauthenticated API call** | **401 if `X-Requested-With: XMLHttpRequest` OR the `Accept` header does not admit `text/html`** — and the 401 still carries a `Location` header. Source-confirmed | **unconditional 302** — the outpost handler ends at `StatusCode::FOUND` with no `Accept` / `X-Requested-With` / `Sec-Fetch-*` check anywhere in the path | n/a (not a gate) | **302 by User-Agent sniffing** — `Chrome\|Gecko\|AppleWebKit\|Opera\|Edge` regex; **no request header can change it** | 302 unless `Accept` is exactly `application/json` | n/a — `WWW-Authenticate`, never a redirect |
| Session default | 1 h expiry, **5 min inactivity**, 1 month remember-me. Inactivity slides; **remember-me disables the inactivity timer entirely**; the cookie expiry is a **hard wall from login**, it does not slide | **`access_token_validity` = 1 hour**, outpost cookie = that + 1 s; `session_duration` = *"until the browser is closed"*; **sessions do not slide** ([#14304](https://github.com/goauthentik/authentik/issues/14304) open since 2025-04-30) | 60 min own session, but **per-client tokens up to 365 days** since v2.13.0 | NOT VERIFIED | IdP's | browser-managed |
| **Advisories** | **7 in 5 years, exactly one High/Critical** — CVE-2021-32637, nginx authz-path bypass, fixed 4.29.3 in **2021**. The rest are Low/Moderate; the two most recent (2026-05) are canonicalization edge cases fixed in 4.39.20 | **47 in 4 years — 6 Critical, ~26 High**, incl. **two on the forward-auth path and both recent**: [GHSA-fj56-5763-j8pp](https://github.com/goauthentik/authentik/security/advisories) (CVE-2026-25748, High 8.6, *"Forward-authentication bypass with malformed session cookie on Traefik and Caddy"*) and GHSA-5wcc-hf24-rf5h (High 8.7, `X-Original-URI`) | **13** in ~6 months, worst GHSA-rm8c-2cv8-jwf6 **Critical 9.6** (email-verification token survives an address change) | GHSA-r27r-rr9v-vv37, **8.1**, on the `path.allow` regex — i.e. on the exact escape hatch you would need for a PWA | NOT VERIFIED | n/a |
| Support window | *"To the last 3 minor versions upon request"* ([versioning policy](https://www.authelia.com/policies/versioning/)) | **only `2026.5.x` and `2026.8.x`** — 3 advisories were fixed in `2026.8.2` itself | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | Caddy's |
| Second user | add 6 lines to `users.yml` | admin UI | admin UI | config/UI | IdP's job | add one line |
| Exit path | a YAML file of argon2 hashes | `pg_dump` | SQLite file | SQLite file | none (stateless) | one line |

Caddy's [`forward_auth`](https://caddyserver.com/docs/caddyfile/directives/forward_auth)
is a first-class directive whose **documented example is Authelia**: *"proxies a
clone of the request to an authentication gateway, which can decide whether
handling should continue, or needs to be sent to a login page."* On 2xx the
`copy_headers` fields are merged into the original request; on non-2xx the auth
server's response — typically a redirect — is returned to the client. Keep that
last sentence in mind; §4.3 is about it.

**NOT VERIFIED:** RAM floors for Authelia, Pocket ID, Tinyauth and oauth2-proxy (no
official figures published); Tinyauth's passkey support; CVE history for each of
the six (not enumerated in this pass — **check before deploying**).

### 4.2 A gate is not an identity provider, and at project four you need both

The single most useful finding in this study, and it is not about MyHabits.

Forward-auth works beautifully for a browser app. It breaks **native mobile
clients**, which cannot follow an HTML login redirect. The canonical example is
Immich, whose community has this written down repeatedly: the mobile app cannot
work with `forward_auth` redirection, basic-auth credentials in the URL are not
passed for upload or video playback, and the recommended fix is to stop gating it
and instead register it as an **OIDC client** of the same IdP
([immich #3118](https://github.com/immich-app/immich/discussions/3118),
[#23831](https://github.com/immich-app/immich/discussions/23831),
[Authelia's own Immich OIDC guide](https://www.authelia.com/integration/openid-connect/immich/)).

So the platform layer must be able to do **both**:

- **forward-auth** for the apps you wrote, which have no login screen at all;
- **OIDC provider** for the apps you did not write, which have their own.

That is the test that eliminates **oauth2-proxy** (a consumer, needs an IdP behind
it) and **Caddy `basic_auth`** (a gate with no identity) as *platform* answers, and
it demotes **Pocket ID** (an excellent IdP, but no gate — you would run it *plus*
oauth2-proxy, which is two containers doing what Authelia does in one).

**Survivors: Authelia, Authentik, Tinyauth.**

### 4.3 The installed-PWA question, which everyone gets wrong

Two separate problems get conflated here. Separate them.

**Problem 1 — does the session survive weeks on a phone?** Yes, and the fear is
misplaced. WebKit's 7-day cap applies to *"all of website.example's **non-cookie**
website data"* — script-writable storage, not `Set-Cookie`
([ITP 2.3](https://webkit.org/blog/9521/intelligent-tracking-prevention-2-3/)).
Every candidate here sets a server-side `HttpOnly` cookie, which was never in
scope. WebKit's [storage policy](https://webkit.org/blog/14403/updates-to-storage-policy/)
additionally exempts *"origins in persistent mode"* from eviction and grants that
mode *"based on heuristics like whether the website is opened as a Home Screen Web
App"*, so the service worker and caches are protected too. (**SEMI-VERIFIED:**
community sources claim an explicit home-screen exemption from the cap; the ITP 2.3
post itself does not say it.)

What *does* bite is configuration, and the source tells a more forgiving story than
the defaults suggest. Authelia's documented
[session defaults](https://www.authelia.com/configuration/session/introduction/)
are **expiration 1 hour, inactivity 5 minutes, remember-me 1 month** (`-1`
disables). Three behaviours, all source-confirmed:

- **Inactivity slides** — `LastActivity` is refreshed on every authz request.
- **Ticking remember-me disables the inactivity timer entirely** (`if isAnonymous
  || userSession.KeepMeLoggedIn || … { return false }`). So a remembered session is
  not killed by the 5-minute idle timer.
- **The cookie expiry does not slide.** `UpdateExpiration` is called once, at
  login. It is a hard wall at 1 hour, or 1 month with remember-me.

**So: tick remember-me, set it long, and the 5-minute default stops mattering.**
Same hard-wall shape as Authentik, 720× longer, with the idle timer switched off
instead of absent.

The real trap is elsewhere, and it is **confirmed, not inferred**: the default
session provider is in-memory, the docs say *"Not configuring redis leaves Authelia
stateful"*, and the maintainer confirms *"Authelia stores sessions in memory by
default. For persistence at this time you need to use and configure redis"*
([#6911](https://github.com/authelia/authelia/discussions/6911)). **A restart
destroys every session, remember-me included** — the cookie survives, the
server-side session it points at does not. On a host with automated image updates
that means being logged out roughly whenever a new image ships. Redis as container
#2 is the only fix, and **it is the single reason the recommended stack might be
four containers rather than three.** Decide that on how much the re-login annoys
him, not on principle.

**Problem 2 — do the app's `fetch()` calls survive?** This is the real one. A
service-worker-controlled PWA makes API calls with `fetch`, which **follows
redirects transparently**: a 302 to the login portal comes back as `200 OK` with
an HTML body, and the adapter parses a login page as if it were data.

Authelia is the only candidate whose behaviour was confirmed **in source**
(`getAuthzRedirectStatusCode`, `internal/handlers/handler_authz_util.go`), and the
rule is two conditions ORed:

```go
if ctx.IsXHR() || !ctx.AcceptsMIME("text/html") {
    return fasthttp.StatusUnauthorized      // 401
}   // else 302 for GET/OPTIONS/HEAD, 303 otherwise
```

`IsXHR()` checks only `X-Requested-With`. `AcceptsMIME` parses `Accept` and counts
`*/*` as a match **only at index 0**. Concretely: a bare `fetch(url)` sends
`Accept: */*` and therefore **still gets a 302** — the trap is real — while
`fetch(url, {headers: {Accept: 'application/json'}})` gets a **401**, and
`application/json, */*` does too, because the trailing wildcard is not at index 0.
Real navigations (`Accept: text/html,…`) keep their 302, which is what you want.

**So the mitigation is one header, and it is `Accept`, not `X-Requested-With`.**
There is exactly one `fetch` call site in the adapters
(`src/adapters/sheets/sheetsApi.ts:72`), so it is a one-line diff in a future REST
adapter.

And a property nobody advertises: **Authelia's 401 still carries a `Location`
header** — `setSpecialRedirect()` whitelists `StatusUnauthorized` alongside the 3xx
codes and sets it anyway. Because the proxy copies that response back on the *app's
own origin*, it is same-origin to the app's JS, so the adapter can read `Location`
off the 401 and do a top-level navigation to the portal. A clean, scripted re-login
path that neither Authentik nor oauth2-proxy offers.

**The contrast that settles the layer choice.** Authentik's Rust outpost ends every
unauthenticated forward-auth request at `StatusCode::FOUND` — **302,
unconditionally** — and a grep of that path for `Accept`, `X-Requested-With` and
`Sec-Fetch-*` returns nothing
([forward.rs](https://github.com/goauthentik/authentik/blob/main/src/outpost/proxy/application/handlers/forward.rs)).
With a one-hour non-sliding cookie, an installed PWA left alone overnight fails on
its next startup `fetch()`, silently, by parsing a login page as data. Authentik
has already shipped and fixed a PWA-specific redirect bug of its own
([#6886](https://github.com/goauthentik/authentik/issues/6886)).

**Tinyauth is worse, and unworkaroundable:** it decides by **sniffing the
User-Agent** (`Chrome|Gecko|AppleWebKit|Opera|Edge`), so a PWA's `fetch()` gets a
302 and no request header changes that. The escape hatches are `Authorization:
Basic` (breaks for TOTP users) or a `path.allow` regex — the exact feature behind
its own 8.1-severity advisory GHSA-r27r-rr9v-vv37.

**Scorecard on the one axis that decides this section:**

| | Behaviour for an app's `fetch()` | Fixable from the app? |
| --- | --- | --- |
| **Authelia** | 401 (+`Location`) on `Accept: application/json` | **yes, one header** |
| oauth2-proxy | 401 only on an exact `application/json`; ignores `X-Requested-With` | partly |
| **Authentik** | unconditional 302 | **no** |
| **Tinyauth** | 302 by User-Agent regex | **no** |
| `basic_auth` | 401 + `WWW-Authenticate`, always | n/a — never redirects |

Treat the confirmation as a **30-minute spike before committing** rather than a
leap of faith — but the spike now has a known-good and two known-bad answers to
compare against, and Authelia is the known-good.

### 4.4 Verdict on the layer

**Authelia.** One container — a YAML users file, SQLite storage and in-memory
sessions is a supported production configuration for one person; every other
warning in its docs is scoped to high availability. The image is under 20 MB and
observed memory *"normally under 30 megabytes"* (its own marketing copy, not a
benchmark). Passkeys including first-factor, an OIDC provider for the day project 4
is off-the-shelf, the documented Caddy integration, two maintainers, and the only
candidate that returns a workable 401 to an app's `fetch()`.

**And the security record is the strongest on the list, which was not a given.**
**7 advisories in five years, exactly one High/Critical — CVE-2021-32637, an nginx
authz-path bypass, fixed in 2021.** The two most recent (2026-05, fixed in 4.39.20)
are Low/Moderate canonicalization edge cases. Compare Authentik: 47 advisories, six
Critical, and **two bypasses on the forward-auth path itself, dated 2025-12 and
2026-02** — one of them specifically *"on Traefik and Caddy"*. Security fixes reach
*"the last 3 minor versions upon request"* rather than Authentik's two branches.
Exit path: a YAML file of argon2 hashes.

**Authentik is demoted, not runner-up.** Its OIDC provider is more mature than
Authelia's beta and it has a company behind it. Against that: three containers and
2 GB of RAM for one person, an unconditional 302 with a one-hour non-sliding cookie
(§4.3), **47 advisories including six Critical and two landing squarely on the
Caddy/Traefik forward-auth path**, and only the two most recent branches supported —
three of those advisories were fixed in `2026.8.2` itself. An unattended Authentik
is a liability, and "unattended" is this document's operating assumption.

**Tinyauth** is the most appealing on size and is OpenID Certified, but it is one
maintainer, AGPL-3.0, at **v5 in about two years**, warning *"configuration may
change often"* — the upgrade treadmill this ADR exists to avoid. **Pocket ID** is
the best *identity source* here and the only one with a clean answer to "stay
logged in for weeks" (per-client refresh tokens up to 365 days), but it is
passkey-only **by design**: TOTP and recovery codes were both closed as not
planned, on the reasoning that *"if we introduce this feature users can be phished
with the recovery codes"*. Principled, and unforgiving if the passkey is lost.
Pocket ID + Tinyauth as the gate is a documented and genuinely attractive pairing —
and it is two containers across two projects with a bus factor of one-to-three and
22 advisories between them this year.

**`basic_auth` remains correct as a day-one stopgap** (ADR 0003 §3.5). Worth saying
plainly why it survives every objection in §4.3: **it never redirects.** A 401 with
`WWW-Authenticate` is what the Fetch spec guarantees a `fetch()` sees. Not the
platform answer — no identity, no logout, no MFA, breaks native clients — but the
only rung on this ladder with nothing to spike.

---

## 5. Backups, as a platform concern

The per-app backup feature is the trap. PocketBase's is excellent (§2.4) and it
backs up *PocketBase*; project 3's Postgres and project 4's flat files are not its
problem. **One agent over all volumes** is the pattern.

### 5.1 restic vs borg

| | **restic** | **borg** |
| --- | --- | --- |
| Version, licence | **0.19.1** (2026-07-05), BSD-2. Still 0.x — *"Once version 1.0.0 is released, we guarantee backward compatibility"* | **1.4.5** (July 2026), BSD-3. **Borg 2 is still beta** — `2.0.0b24`, 2026-09-02, *"(testing releases out, no final release yet)"* |
| Bus factor | fd0 3995, MichaelEischer 3548, rawtaz 250 — a ~6-person org, **no company** | ThomasWaldmann, via his own consultancy, then a long drop |
| **S3 / object storage direct** | **yes** — S3, B2, Azure, GCS, rclone, SFTP, rest-server | **no, in stable 1.x** — SSH only, and *"Borg is installed on the server, too"*. Borg 2 adds `s3:`/`b2:` — **beta only** |
| Retention gotcha | `forget` then **`prune`** — `forget` alone frees **zero bytes** | `prune` then **`compact`** — *"disk space is not freed until you run `borg compact`"* |
| Restore | `restic restore latest --target /tmp/x`; `restic mount` (FUSE) | `borg extract` — **no `--target`**: *"extract always writes into the current working directory"* |
| Integrity | `check --read-data` = a **full re-download**; `--read-data-subset=5%` samples it | `check --verify-data`, *"very time consuming"*; `--max-duration` spreads it |
| Immutability | **none natively** — S3 Object Lock [closed as *not planned*](https://github.com/restic/restic/issues/4992); use `rest-server --append-only` | `borg serve --append-only`, but *"running delete or prune… will still be allowed"* |

**restic**, on one fact: it speaks object storage natively, so the offsite copy is a
URL and a password, not a second machine you also have to patch. Borg 2 closes that
gap and has been in beta for years with no announced GA date — not a foundation for
a ten-year plan.

**Two container-specific facts that bite:**

- **Set `--hostname` on the restic container.** The docs: *"Restic relies on the
  hostname for various operations. Make sure to set a static hostname using
  `--hostname` when creating a Docker container."* Docker assigns a random
  hostname per container, so without this your retention policy silently
  fragments across phantom hosts and `--keep-daily 7` keeps seven copies of
  nothing. Official images: `restic/restic`, `ghcr.io/restic/restic`.
- **Check for exit code 3.** restic's documented codes include **3 = "backup
  couldn't read some source data"** — a *partially failed* backup that a naive
  `&& echo ok` treats as success ([scripting](https://restic.readthedocs.io/en/stable/075_scripting.html)).

### 5.2 Live SQLite — the part that is actually wrong in most homelab setups

Copying the file is not a backup. SQLite says so
([How To Corrupt](https://www.sqlite.org/howtocorrupt.html)):

> Systems that run automatic backups in the background might try to make a backup
> copy of an SQLite database file while it is in the middle of a transaction. The
> backup copy then might contain some old and some new content, and **thus be
> corrupt**.

Under WAL it is worse, because the state is spread across three files
([wal.html](https://www.sqlite.org/wal.html)):

> **If a database file is separated from its WAL file, then transactions that were
> previously committed to the database might be lost, or the database file might
> become corrupted.**

**That is exactly what a volume-level backup agent does** — it captures `app.db`,
`app.db-wal` and `app.db-shm` at three different instants. It usually restores.
Sometimes it does not, and it will not tell you which, which is the worst property
any backup can have.

SQLite names three safe alternatives: `sqlite3_rsync` (from 3.47.0, 2024-10-21),
`VACUUM INTO`, and the backup API. **Use `VACUUM INTO`.** It is *"transactional in
the sense that the generated output database is a consistent snapshot"*, and the
docs exempt it from blocking the app — *"VACUUM (**but not VACUUM INTO**) is a
write operation"*. The backup API instead restarts whenever the source is written,
and the docs admit where that ends: *"If the backup process is restarted frequently
enough **it may never run to completion**"*
([backup.html](https://www.sqlite.org/backup.html)) — a livelock you cannot debug
from outside somebody else's container.

**So: the backup job's pre-hook runs `VACUUM INTO /srv/data/<app>/snapshot.db` for
every SQLite file, and restic backs up the snapshots, not the live files.** Five
lines — and it is what lets you ignore Borg's much stricter advice, *"**Shut down
containers before backing up their storage volumes**"*
([quickstart](https://borgbackup.readthedocs.io/en/stable/quickstart.html)). You
need stop nothing if what you back up is already consistent.

**Litestream** (v0.5.17, 2026-08-31, Apache-2.0) is the continuous version and what
PocketBase's FAQ recommends for disaster recovery — but two v0.5 changes disqualify
it as *the* backup: *"Age encryption is not available in v0.5.0+"* (no client-side
encryption at all) and *"v0.5 supports exactly one replica per database"* (so it
cannot satisfy 3-2-1 alone). A complement, never a replacement. At one form a day,
skip it.

### 5.3 Postgres, when a project brings one

Same shape, same rule: dump, never copy. `pg_dump` is safe on a live server —
*"pg_dump does not block other operations on the database while it is working"* —
and so is `pg_basebackup`, which is *"used to take a base backup of a **running**
PostgreSQL database cluster"*. Copying `PGDATA` is not: *"The database server
**must** be shut down in order to get a usable backup. Half-way measures such as
disallowing all connections will not work"*
([backup-dump](https://www.postgresql.org/docs/current/backup-dump.html),
[app-pgbasebackup](https://www.postgresql.org/docs/current/app-pgbasebackup.html),
[backup-file](https://www.postgresql.org/docs/current/backup-file.html)). PITR
needs `pg_basebackup` + WAL archiving; dumps *"cannot be used as part of a
continuous-archiving solution"*. One wording trap: **PG 18 changed pg_dump's
"consistent backups" to "consistent exports"** and added a caveat against using it
for regular production backups — cite the version you mean. If a project ever
outgrows a cron'd dump: **pgBackRest** 2.59.1 (MIT), the only tool here whose
vendor documents object-store immutability as a feature.

**The platform-level point stands regardless: the backup container gets one more
pre-hook line, not a new backup system.**

### 5.4 3-2-1, for one person

The rule has an authoritative source, and it is a government one — *Data Backup
Options*, Ruggiero & Heckathorn, produced by Carnegie Mellon for **US-CERT** and
hosted by [CISA](https://www.cisa.gov/sites/default/files/publications/data_backup_options.pdf):

> **3** – Keep 3 copies of any important file: 1 primary and 2 backups.
> **2** – Keep the files on 2 different media types to protect against different types of hazards.
> **1** – Store 1 copy offsite (e.g., outside your home or business facility).

(Its own footnote credits Peter Krogh, *The DAM Book*, 2009 — the government
document restates the rule, it did not invent it.)

Concretely, and cheaply:

| Copy | Where | Cost |
| --- | --- | --- |
| 1 — live | `/srv/data/*` on the server | — |
| 2 — local repo | restic repo on a second disk/path on the same box (fast restore of "I deleted the wrong thing") | — |
| 3 — **offsite** | restic to object storage, encrypted, in a **different failure domain than the server** | see below |

**Choose the offsite target on egress and immutability, not on the storage price.**
At a few hundred megabytes the storage line is noise; the numbers that bite are
what a full restore costs and whether a compromised host can delete the repo.
(EUR figures are net of VAT; EUR and USD columns are not directly comparable.)

| Target | Per TB/month | Egress | **Object Lock** | Note |
| --- | --- | --- | --- | --- |
| **OVH Cold Archive 3AZ** (Paris) | **€1.66** | **free** | **yes** | 180-day minimum, €0.009/GB retrieval. Cheapest EU option with real WORM. |
| **Hetzner Storage Box** BX11 1 TB | **€3.20** | **free, unlimited** | **no** — no S3 API at all | Native restic/Borg/rclone/SFTP, snapshots, 100 sub-accounts |
| **Backblaze B2** | **$6.95** | free to **3× average stored**, then $0.01/GB | yes | No minimum duration; EU Central at the same price |
| Cloudflare R2 | $15.00 / $10.00 IA | **free** | **NO — does not implement S3 Object Lock** | Has its own non-S3 "bucket locks"; restic and rclone will not find WORM here |
| AWS S3 Glacier Deep Archive (eu-west-1) | $0.99 | **$0.09/GB** | yes | **~$110 to pull back 1 TB** — nine years of storage in one restore. Plus 40 KB metadata billed per object. |

Sources: [B2](https://www.backblaze.com/cloud-storage/pricing),
[Hetzner](https://www.hetzner.com/storage/storage-box/),
[OVH](https://www.ovhcloud.com/en-ie/public-cloud/prices/),
[R2 pricing](https://developers.cloudflare.com/r2/pricing/) +
[R2 S3 compatibility](https://developers.cloudflare.com/r2/api/s3/api/),
[Glacier](https://aws.amazon.com/s3/storage-classes/glacier/). Scaleway Glacier
(€2.54, EU, Object Lock) is a fine fourth option.

**The immutability footnote that matters:** restic has no native S3 Object Lock
support *and will not get it* — it writes lock files inside its own repository, so
[#4992](https://github.com/restic/restic/issues/4992) is closed as *not planned*.
Buying a bucket with Object Lock therefore does **not** harden a restic repo; you
need `rest-server --append-only`, or a second credential the server never holds.

**Practical answer: Hetzner Storage Box, ~€3/month.** Free egress means a full
restore and a `--read-data` verification cost nothing — which is exactly the thing
you want to do often, and the thing Glacier's $0.09/GB quietly discourages.

### 5.5 The restore that has actually been tested — the point nobody does

An untested backup is a belief, not a backup. The trick is making the test cheap
enough that it happens by itself.

```sh
# in the backup container, weekly, after the backup:
restic restore latest --target /tmp/verify --include /srv/data/myhabits
sqlite3 /tmp/verify/srv/data/myhabits/snapshot.db \
  "select count(*) from entries" | grep -qE '^[0-9]{3,}$' \
  && curl -fsS https://hc-ping.com/$HC_UUID_RESTORE
rm -rf /tmp/verify
```

Three properties make this the right shape:

1. **It restores, it does not just `check`.** `restic check` verifies the
   repository; it does not verify that the bytes are a database you can open.
2. **It asserts on content** — a row count with a plausible magnitude, not
   "the file exists".
3. **It is a dead-man's switch.** The `curl` is the *only* success signal; if the
   restore fails, the container is dead, or the cron never fired, nothing pings
   and [healthchecks.io](https://healthchecks.io/pricing/) emails him — **20 checks
   free**, and self-hostable (BSD-3, v4.4, Django + Postgres/SQLite).

Alongside it, the cheap integrity sweep. `restic check --read-data` re-downloads
the whole repository, which is why nobody runs it. Sample it instead —
`restic check --read-data-subset=5%` covers the repo in ~20 nights at 5% of the
cost per night (Borg's equivalent: *"a daily check with `--max-duration=3600`…
would result in one full repository check per week"*). On a free-egress target it
costs nothing at all.

Upstream is thin but unambiguous that this is your job. restic's README: *"Much
more important than backup is restore, so restic enables you to easily verify that
all data can be restored."* Borg's quickstart: *"Do not forget to test your created
backups…"* **Neither documents an end-to-end automated restore test** — the script
above is composition, not a blessed recipe.

That last property is the whole design principle of this ADR: **silence must be an
alarm, never the default.** A monitoring system you have to remember to look at is
a monitoring system that will be looked at once.

---

## 6. Security posture, concretely

Ordered by payoff per hour, with an honest label on each.

| # | Measure | Verdict | Honest downside |
| --- | --- | --- | --- |
| 1 | **Bind every published port to loopback** — `127.0.0.1:8080:8080`, or `expose:` and no `ports:` at all. Only the proxy binds `0.0.0.0`. | **AUTOMATIC, structural** — it cannot rot | Docker says this itself: *"When you publish a container's ports using Docker, traffic to and from that container gets **diverted before it goes through the `ufw` firewall settings**"* ([packet-filtering-firewalls](https://docs.docker.com/engine/network/packet-filtering-firewalls/)). One character per port **deletes** that whole class of problem instead of answering it. |
| 2 | **No default credentials, anywhere.** Authelia admin, PocketBase superuser, Postgres, **the restic repo password** (lose it and the backups are gone). | REQUIRES DISCIPLINE, once | The one that actually gets people. |
| 3 | **Auth at the edge before anything is exposed** — §4, or `basic_auth` on day one. | AUTOMATIC | — |
| 4 | **Backup + restore verification with a dead-man's switch** (§5.5). | **FAILS LOUDLY** — the design goal | Costs one cron and one free account. |
| 5 | **Host OS patching: `unattended-upgrades`.** *"auto-installs security updates, but not new features"* ([Debian wiki](https://wiki.debian.org/UnattendedUpgrades)). | **AUTOMATIC to install, REQUIRES DISCIPLINE to reboot** | Host packages only, **never containers**. And the trap: **`Unattended-Upgrade::Automatic-Reboot` defaults to `false`** — the default leaves you patched-on-disk and still running the old libssl forever. Set it with a reboot time, or install `needrestart`. |
| 6 | **Container patching** — see §6.1. The standard advice is dead. | — | — |
| 7 | **A CVE tripwire on running images.** `docker ps --format '{{.Image}}' \| sort -u \| xargs -rn1 grype -q --fail-on high` in cron. grype v0.118.0 (2026-08-27, runs fully locally, no account); Trivy v0.74.0 (2026-08-14, `--exit-code 1 --severity HIGH,CRITICAL --ignore-unfixed`). | **AUTOMATIC + FAILS LOUDLY** — the non-zero exit makes cron mail him | **This is the thing that tells him a container is eighteen months stale.** A scanner run by hand is a scanner run once. Docker Scout's Personal plan is 1 repo — worst fit of the three. |
| 8 | **Secrets as files, not env vars.** Compose `secrets:` mounts at `/run/secrets/<name>`. Docker's own warning about the alternative: *"Environment variables are often available to all processes, and it can be difficult to track access. They can also be printed in logs when debugging errors **without your knowledge**"* ([use-secrets](https://docs.docker.com/compose/how-tos/use-secrets/)). | AUTOMATIC | `sops` v3.13.3 (MPL-2.0, **CNCF Sandbox since 2023**) + `age` v1.3.2 only if secrets must live *in* the repo. For one host you already back up, that is a second key-management problem solving a problem you do not have. |
| 9 | **fail2ban / CrowdSec.** CrowdSec v1.8.1 (2026-09-03, MIT); its Caddy and Traefik bouncers are **proxy modules/plugins, so zero extra containers**. | fail2ban: **REQUIRES DISCIPLINE and silently no-ops** / CrowdSec: mostly AUTOMATIC | **Skip both.** fail2ban has three independent ways to be installed, running, logging bans and protecting nothing — its default action writes to `INPUT`, but DNAT'd container traffic traverses `FORWARD`, so the ban does nothing and never says so. And behind measure 1 + measure 3 there is no login form left to brute-force. CrowdSec's engine alone also blocks nothing without a bouncer — its docs say so outright. Free-tier limits **NOT VERIFIED**. |
| 10 | **TLS.** Caddy v2.11.4: certificates obtained and renewed automatically, and *"HTTP is redirected to HTTPS"* ([automatic-https](https://caddyserver.com/docs/automatic-https)). | **AUTOMATIC** | **Caddy does NOT set HSTS by default** — the Automatic HTTPS page never mentions it, and [proposal #4751 "Automatic HSTS"](https://github.com/caddyserver/caddy/issues/4751) is still open, which is the proof. Add the `header` line yourself. |
| 11 | **Let's Encrypt lifetime: keep the 90-day default.** 6-day short-lived certs went GA 2026-01-15 ([announcement](https://letsencrypt.org/2026/01/15/6day-and-ip-general-availability)); the cap drops to 45 days by Feb 2028. | AUTOMATIC | **Do not opt into `shortlived`.** 90 days gives ~60 days to notice a broken renewer; 6 days gives hours. Longer is the safer default for one operator. |
| 12 | **Do not HSTS-preload a personal domain.** [hstspreload.org](https://hstspreload.org/): *"Inclusion in the preload list cannot easily be undone. Domains can be removed, but it takes months…"*, and it binds *"all subdomains and nested subdomains"*. | **DON'T** | Plain `max-age`: yes. Preload: a months-long irreversible commitment for every future subdomain, to close a first-visit-only window. |
| 13 | **VPN-only exposure** — §6.2. | The strongest option | It costs the PWA. |

### 6.1 Container patching — the standard advice is now dead

**Watchtower is archived.** The README: *"⚠️ This project is no longer
maintained"*, archived **2025-12-17**, last upstream release **v1.7.1
(2025-11-11)** ([repo](https://github.com/containrrr/watchtower),
[discussion #2135](https://github.com/containrrr/watchtower/discussions/2135)).
The maintainers' reason: *"Neither @piksel, nor I, are big users of docker anymore,
and frankly lost interest (and time) in maintaining the project."* They recommend
**no** successor and warn: *"A few of the active forks I've looked at are full of
AI slop and while they might work, I wouldn't advice using any of them."* It is
also already **broken on Docker Engine ≥ 29** — the upstream image is built against
Docker API client v1.25 and the engine now requires v1.44+
([#2132](https://github.com/containrrr/watchtower/issues/2132)).

Sit with that, because it is this ADR's thesis with a bow on it: **the tool whose
entire job was to prevent unmaintained software abandoned itself, and its users
found out when it stopped working.**

The two remaining shapes:

| | **Auto-pull the tag** (a Watchtower fork, or `podman auto-update`) | **Renovate/Dependabot PRs against a git repo of compose files** |
| --- | --- | --- |
| Label | AUTOMATIC | **FAILS LOUDLY** |
| What you get | Patched without thinking | A PR per image bump, changelog attached, **diffable and revertable** |
| What goes wrong | It follows *the tag you started with*. On `:latest` a breaking major lands unannounced at 03:00; on `:1.2.3` it never updates you at all. **There is no setting that is both safe and useful.** On a v0.x project like PocketBase (§2.3) this is not hypothetical. | **Nothing happens if you ignore the PRs.** But an 18-month-old open PR is *visible evidence of neglect*; Watchtower's silence is not. |
| Who maintains the mechanism | A fork by one un-endorsed person (`nicholas-fedor/watchtower` v1.22.1, 2026-09-09 — active, but one person), **or** `podman auto-update`, which is **first-party, systemd-timered daily, and cannot be abandoned by a volunteer** | Mend (hosted Renovate: *"a generous free tier… unlimited number of public and **private** repositories"*) or GitHub (Dependabot's `docker-compose` support went **GA 2025-02-25**) |

**Recommendation: Renovate on a private git repo holding the compose files and the
Caddyfile, `pinDigests` on, automerge for patch and minor, a PR for major.** Its
`docker-compose` manager matches `compose.yaml` / `docker-compose*.yml` out of the
box and preserves tag precision; `pinDigests` writes `image:1.4.2@sha256:…`, which
turns invisible tag drift into a reviewable diff. Automation where it is safe, a
loud stop where it is not — and the infra becomes diffable and restorable, which is
ADR 0003 §3.3's `git init` advice applied to the platform instead of `perso/`.

If unattended pulls are wanted anyway, **use `podman auto-update`, not a Watchtower
fork.** Identical semantics, vendor-maintained timer, `--rollback` on a failed
health check. Sources:
[Renovate docker-compose](https://docs.renovatebot.com/modules/manager/docker-compose/),
[Renovate docker](https://docs.renovatebot.com/docker/),
[Mend hosted](https://docs.renovatebot.com/mend-hosted/overview/),
[Dependabot GA](https://github.blog/changelog/2025-02-25-dependabot-version-updates-now-support-docker-compose-in-general-availability/),
[podman auto-update](https://docs.podman.io/en/latest/markdown/podman-auto-update.1.html).

**Live proof that this is the real risk, in this repository:**
`server/Dockerfile` says `FROM node:20-alpine`, and **Node 20 is EOL** (ADR 0003
§12). That container is already stale, today, on a project a week old, with an
attentive owner. Nothing about a homelab improves that number over eighteen months.

### 6.2 WireGuard / Tailscale — strongest, and it costs the PWA

Not exposing a port at all beats every other measure combined. Tailscale's free
Personal plan is **up to 6 users with unlimited devices**
([pricing](https://tailscale.com/pricing)), which also answers "what about my
partner" without a bill. Note **Funnel is not a hardening measure** — it *"route[s]
traffic from the broader internet to a local service"*, i.e. it is public exposure
with a different edge operator. Serve (tailnet-only) is the one that matters here.

**Headscale** (v0.29.3, 2026-07-29) exists if the coordination server must also be
self-hosted, but it is still 0.x and explicitly *"not associated with Tailscale
Inc."*, scoped to *"self-hosters, enthusiasts and hobbyists"*. Self-hosting the
control plane your own access depends on is the wrong rung of the ladder when the
free tier already covers six people.

**What actually breaks for an installed PWA behind a VPN-only origin:**

| Capability | VPN-only? | Why |
| --- | --- | --- |
| **Web Push delivery** | **works** | RFC 8030: *"the push service then delivers these messages back to the user agent"* over the browser's own connection. **Your origin is never contacted to receive a push** ([RFC 8030](https://www.rfc-editor.org/rfc/rfc8030.html)) |
| Your server sending it | works | needs only **outbound** reachability to FCM/APNs |
| Offline shell | works | Cache Storage is local |
| **Notification tap → opens the app** | **fails** | it navigates to your origin |
| **`fetch()` inside the push handler** | **fails** | the common "push a tickle, fetch the payload" pattern dies, and Chrome then forces a generic "site updated in background" notice |
| Install / first load | fails | manifest, SW registration and precache all need the origin |

So a VPN-only PWA still opens and still buzzes — but **every notification becomes a
dead end** unless the VPN is already up. And the always-on setting that fixes that
is documented, in Tailscale's own tracker, as breaking DNS
([#12220](https://github.com/tailscale/tailscale/issues/12220)), LAN access
([#13407](https://github.com/tailscale/tailscale/issues/13407)) and — with "block
connections without VPN" — **all** connectivity on key expiry
([#8057](https://github.com/tailscale/tailscale/issues/8057)).

**That last one is the eighteen-month failure mode wearing a different hat:
Tailscale node keys expire by default. Disable key expiry on the phone and the
server, or in six months the app silently stops being reachable and you will blame
the app.**

**Recommendation: use it for the admin surfaces** — SSH, the Authelia config, any
dashboard — and keep the app origins public behind the auth edge. Most of the
benefit, none of the cost. And if MyHabits ever does go VPN-only, **put the full
payload in the push message and never `fetch()` in the handler**, so it degrades
gracefully instead of confusingly.

### 6.3 "What would make this not scary?" — an evening's checklist

Ten items, none of which depends on remembering anything next month.

- [ ] **Every app container has `expose:`, none has `ports:`.** Only Caddy binds 80/443.
- [ ] **Caddy is up with automatic TLS**, and one `header Strict-Transport-Security "max-age=31536000"` line. No `preload`.
- [ ] **Authelia in front of every hostname** (or `basic_auth` tonight, Authelia this weekend). Verify by `curl`-ing an app URL and getting a 302 or 401.
- [ ] **A long `remember_me`, and tick the box at login** — that alone switches the 5-minute inactivity timer off. Accept that a container restart still logs you out unless you add Redis.
- [ ] **`Accept: application/json` on the app's API calls**, so an expired session returns 401 instead of an HTML login page the adapter would parse as data.
- [ ] **Every password changed from its default**, generated, stored in a password manager. The restic repo password too — **losing it loses the backups**.
- [ ] **`unattended-upgrades` enabled** on the host.
- [ ] **The compose files and Caddyfile in a private git repo**, with Renovate enabled.
- [ ] **The backup job running**, with `VACUUM INTO` pre-hooks and an offsite restic target.
- [ ] **One restore already performed by hand**, and the weekly verification job pinging a dead-man's switch (§5.5).

The last two are the ones that matter. Everything above them is protecting data
you have not yet proved you can get back.

---

## 7. Comparison table

Fitness at project four, which is the only column that decides anything.

| | Footprint | Maintainers | Auth features | Backup story | Upgrade risk | **Fit at project 4** |
| --- | --- | --- | --- | --- | --- | --- |
| **PocketBase** (per project) | 1 container, ~15 MB binary | **1 person, no funding, no promises** | password, 32 OAuth2, email-OTP, MFA; **no passkeys, no TOTP, no OIDC provider**, 5-day unrevocable token | **Best free story**: cron ZIP to S3, `CronMaxKeep`, one-call restore | **High** — 0.x, breaking change 3 weeks ago, last migration "1h to a weekend" | **Poor.** ×4 everything. Cannot authenticate a non-PocketBase app. |
| **Appwrite** | **~40 services**, 2 CPU / 4 GB / 2 GB swap | company + team | good | daily on Pro; self-hosted is yours | medium | **Very poor** — the footprint alone |
| **Supabase self-hosted** | **7–9 containers**, 4 GB RAM | company + team | best-in-class | **none included** | medium | **Very poor** (ADR 0003 §6.2) |
| **Directus** | 1–2 containers + a DB | company + team | good; best admin UI | yours | medium + **licence churn** (MSCL, v12, May 2026) | Poor as a platform; good if trap 1 ever dominates |
| **Authelia** + dumb tenants | **1 container**, YAML + SQLite | 2+ humans, Apache-2.0 | password, TOTP, **passkeys incl. 1st factor**, **OIDC provider (beta)**, forward-auth | n/a (§5 covers it) | **Low** — 4.x, stable API | **Best.** Project 4 = 6 lines of compose + 4 of Caddyfile |
| **Authentik** + dumb tenants | **3 containers**, 2 CPU / 2 GB | 1 human + a company (Authentik Security Inc.) | everything, **mature** OIDC, real admin UI — but **unconditional 302** and a 1 h non-sliding cookie | n/a | **medium–high** — only 2 branches supported; **47 advisories, 6 Critical, 2 on the forward-auth path** | **Demoted.** Hostile to an installed PWA on defaults; the least forgiving of neglect |
| **Tinyauth** + dumb tenants | 1 container | **1 human**, AGPL-3.0 | password, TOTP, LDAP, **OpenID Certified OP** | n/a | **High** — v5 in ~2 years, *"configuration may change often"* | Tempting, but it is PocketBase's bus factor with a shorter track record |
| **Pocket ID** + gate | 1 container (+ a gate) | 3 humans, BSD-2 | **passkey-only**, OpenID Certified | n/a | low | Good IdP, **not a gate** — needs a second component |
| **oauth2-proxy** + IdP | 1 container + an IdP | 3+, MIT | **consumer only** | n/a | low | Not an answer on its own |
| **Caddy `basic_auth`** | **0** | Caddy team | password only | n/a | **none** | **Correct tonight, wrong at project 4** — no identity, no logout, no MFA, breaks native clients |

---

## 8. Reference architecture

```
                                 Internet
                                     │   only :443 (and :80 → 301)
                                     ▼
        ┌────────────────────────────────────────────────────────┐
        │  caddy            1 container · binds :80 :443         │
        │  automatic TLS · HSTS header · *.lab.example.org       │
        │  /srv/platform/Caddyfile   (in git)                    │
        └──────┬─────────────────────────────────┬───────────────┘
               │ forward_auth (every request)    │ reverse_proxy (on 2xx)
               ▼                                 │
   ┌──────────────────────────────┐              │
   │  authelia    1 container     │              │
   │  users.yml   (argon2 hashes) │◄─────────────┘
   │  db.sqlite3  (OIDC state)    │
   │  sessions: in memory         │  ← a restart logs you out; add
   │                              │    redis as #2 only if that bites
   │  ─────────── also ────────── │
   │  OIDC provider  ─────────────┼──► apps with NATIVE clients register here
   │  :9091                       │    as OIDC clients instead of being gated
   └──────────────┬───────────────┘
                  │  X-Remote-User / X-Remote-Email copied into the request
 ═════════════════╪══════════════ tenant boundary ════════════════════════════
                  ▼           every tenant: 1 container, `expose:` only,
                              no `ports:`, no auth code, no TLS, no users
   ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌───────────┐
   │ myhabits  │  │  proj-2   │  │  proj-3   │  │  proj-N   │
   │  :8080    │  │  :8080    │  │  :8080    │  │  :8080    │
   └─────┬─────┘  └─────┬─────┘  └─────┬─────┘  └─────┬─────┘
         │              │              │              │
         ▼              ▼              ▼              ▼
   /srv/data/    /srv/data/      /srv/data/     /srv/data/
    myhabits/      proj-2/        proj-3/         proj-N/     ← the ONLY state
         └──────────────┴──────────────┴──────────────┘
                                 │
                                 ▼
   ┌──────────────────────────────────────────────────────────┐
   │  backup     1 container · cron · reads /srv/data:ro       │
   │  1. pre-hook  VACUUM INTO snapshot.db   (every *.db)      │
   │     +         pg_dump                   (every Postgres)  │
   │  2. restic backup /srv/data                               │
   │  3. restic forget --keep-daily 7 --keep-weekly 4          │
   │                   --keep-monthly 12 --prune               │
   │  4. weekly: restic restore → open it → assert a row count │
   │  5. curl https://hc-ping.com/<uuid>   ← SILENCE = ALARM   │
   └────────────────────┬─────────────────────────────────────┘
                        ▼
       Backblaze B2 / Hetzner Storage Box        (copy #3, off-machine)
       encrypted by restic · the password is NOT on this machine

   State lives in exactly two places: /srv/data/* and authelia's two files.
   Everything else is a pinned image and a file in git.
```

What runs where: **three platform containers** (caddy, authelia, backup) plus
**one container per project**. What holds state: `/srv/data/<project>/` and
`/srv/platform/authelia/`. Where a new project plugs in: one compose file, one
Caddyfile block, one directory under `/srv/data`. Nothing else.

---

## 9. The "add project N" runbook

The actual test of whether the pattern is reusable.

```sh
# 1. state
mkdir -p /srv/data/projN

# 2. the tenant — the whole file
cat > /srv/platform/compose/projN.yml <<'YAML'
services:
  projN:
    image: ghcr.io/me/projN:1.4.2      # pinned; Renovate opens the PR
    restart: unless-stopped
    expose: ["8080"]                    # NEVER `ports:`
    volumes: ["/srv/data/projN:/data"]
    networks: ["edge"]
YAML

# 3. the route + the gate — four lines
cat >> /srv/platform/Caddyfile <<'CADDY'
projN.lab.example.org {
    forward_auth authelia:9091 { uri /api/authz/forward-auth
        copy_headers Remote-User Remote-Email }
    reverse_proxy projN:8080
}
CADDY

# 4. nothing — the backup container already walks /srv/data
#    (add one pre-hook line only if projN brings its own DB engine)

# 5. ship
docker compose -f /srv/platform/compose/projN.yml up -d
docker exec caddy caddy reload --config /etc/caddy/Caddyfile

# 6. commit — infra is a diff, not a memory
git -C /srv/platform commit -am "add projN" && git push

# 7. verify the gate actually gates
curl -sI https://projN.lab.example.org | head -1   # expect 302, not 200
```

**Seven steps, two of which are `git` and `curl`, and one of which is "nothing".**

The one variant: **if project N ships a native mobile client**, skip step 3's
`forward_auth` and register it as an OIDC client in Authelia instead (§4.2). That
is one extra block in `authelia/configuration.yml` and the app's own OIDC settings.

Compare Pattern A's equivalent: deploy a second PocketBase, create the schema,
create the user *again*, set the API rules *again*, configure its S3 backup
*again*, note its upgrade cadence *again*.

---

## 10. What it costs

### 10.1 Euros per month

| Line | Cost | Note |
| --- | --- | --- |
| The server | **€0 marginal** — he already has one on a dedicated DNS name | For reference if a new one is needed: Hetzner CX23 **€5.49/mo excl. VAT** since the 2026-06-15 adjustment ([Hetzner docs](https://docs.hetzner.com/general/infrastructure-and-availability/price-adjustment/)); CPX plans rose 2.4–2.75× on the same date, so choose CX |
| Domain | €10–15 / year | already owned |
| Offsite backup | **~€1/mo** at this data volume (B2 $6.95/TB/mo, free egress to 3× stored) | the only genuinely new bill |
| Dead-man's switch | **€0** — healthchecks.io free tier, 20 checks | or self-host it later |
| Auth, proxy, backup software | **€0** — all OSS | |
| **Total** | **≈ €1–6 / month** | and flat as projects are added |

Versus Pattern A's cash cost: also near zero. **Euros are not what separates these
options.** The next table is.

### 10.2 Hours per month — the number that kills homelab setups

Honest estimates, not aspirations.

| Activity | Pattern A (×4 projects) | **Pattern B (recommended)** |
| --- | --- | --- |
| One-off build | ~4 h per project = **16 h** | **6–10 h** once (Caddy + Authelia + backup + the restore test), then ~20 min per project |
| Image updates | 4 changelogs, 4 upgrade windows; a v0.x major is "1h to a weekend" — **1–3 h/mo** | Renovate PRs, automerged for patch/minor: **~20 min/mo** |
| Auth admin | 4 user stores, 4 password flows | **~0** |
| Backups | 4 configs, 4 restore procedures | **~0** (one job, one restore test that pings) |
| Incidents | proportional to daemon count | proportional to daemon count (3 + N) |
| **Steady state** | **1.5–4 h/month** | **≈ 30 min/month** |

**Be blunt about the second column.** Thirty minutes a month is the *design target*,
and it is only achievable because nothing in it requires remembering: Renovate
opens PRs at him, the dead-man's switch emails him, `unattended-upgrades` runs
without him, and Caddy renews without him. Every item that instead requires
*discipline* — "check the container versions quarterly", "test a restore
occasionally" — should be assumed to be **zero hours actually spent**, because
that is what eighteen months of evidence always shows. If a measure cannot be made
automatic or loud, it does not belong in the plan.

**And the honest concession the brief asked for:** for the *data*, managed beats
self-hosted, and this design already concedes it. The offsite copy lives at
Backblaze or Hetzner, not on a second box in the flat. **Self-host the app; buy the
durability.** That split is the reason a one-person platform is defensible at all —
the piece where failure is unrecoverable is the piece he is not operating.

---

## 11. Decision

**Adopt Pattern B: Caddy + Authelia at the edge, restic over `/srv/data` with
`VACUUM INTO` pre-hooks and a verified weekly restore, and every project reduced to
a container and a volume with no auth code in it.**

1. **PocketBase is rejected as the platform**, not because ADR 0003 rejected it as
   this app's backend — those grounds do not generalise — but because it cannot be
   shared: **it is not an identity provider** and has no plans to be.
2. **Pattern A's cost is per-project; Pattern B's is fixed.** They cross at two
   projects, and the question presupposes more than two.
3. **The layer must be both a gate and an IdP**, because project four is an
   off-the-shelf app with a native client that cannot follow a login redirect.
   That leaves Authelia, Authentik and Tinyauth — and of those, **Authelia is the
   only one whose forward-auth returns something an app's `fetch()` can act on**
   (Authentik redirects unconditionally; Tinyauth decides by User-Agent). It also
   has one High/Critical advisory in five years against Authentik's six Criticals
   and two forward-auth bypasses in the last nine months.
4. **The backup is the product.** A one-person platform is defensible only if the
   restore is proven and the offsite copy is somebody else's disk.
5. **Anything requiring sustained discipline is scored as zero.** The plan is built
   from automatic things and loud things.

**Do tonight, before any of the above:** `basic_auth` in the Caddyfile (ADR 0003
§8), and `git init` in `/srv/platform`. Fifteen minutes; they make every later step
reversible.

**Explicitly deferred:** CrowdSec/fail2ban (redundant behind measure 3), sops
(four secrets do not need it), Litestream (a day of loss is acceptable at one form
per day), Headscale, a self-hosted healthchecks.

---

## 12. Revisit triggers and the exit path

### 12.1 Triggers — checkable, not vibes

1. **Project 2 does not appear within a year.** Pattern B's fixed cost was not
   repaid. Collapse to one container + `basic_auth` and stop maintaining Authelia.
2. **A project needs row-level authorisation** (sharing, roles, a second user with
   *different* access). Forward-auth cannot express it; that project gets
   PocketBase or Postgres RLS **behind** the same edge — which the architecture
   already permits.
3. **Authelia's OIDC provider is still "open beta" when a native-client app needs
   it in production.** Move that function to Authentik; keep Authelia as the gate,
   or move both.
4. **The installed PWA fights the login redirect** and §4.3's one-line mitigation
   is not enough. Then the spike was wrong and the app needs a token the service
   worker holds, not a cookie the proxy checks.
5. **A restore verification fails, or the dead-man's switch goes quiet for a week.**
   Stop adding projects; fix the backup. This is the only trigger that outranks
   everything else.
6. **Renovate PRs pile up past ten, or a major is ignored for a quarter.** The
   automation is not automatic enough; move to pinned-minor auto-pull and accept
   the occasional 03:00 breakage instead.
7. **Two hours in a month go to operating the box**, twice running. The
   self-hosting assumption was wrong and ADR 0003 §10's question returns: *did "a
   Docker image on my own server" mean "something simple", not "something I run"?*

**Explicitly not triggers:** a nicer-looking admin UI; PocketBase reaching v1.0
(it would still not be an IdP); a new BaaS launch; wanting realtime.

### 12.2 Exit path — deliberately boring, per component

| Component | If it dies or must go | Cost |
| --- | --- | --- |
| **Authelia** | Users are a **YAML file of argon2 hashes**; sessions are disposable. Move to Authentik/Tinyauth/Pocket ID by re-entering ~2 accounts, or fall back to `basic_auth` in one line. | **hours** |
| **Caddy** | Traefik and nginx both do forward-auth and ACME. The Caddyfile is ~6 lines per project. | hours |
| **restic** | The repo is an open, documented, encrypted format with a maintained CLI; any machine with the binary and the password restores it. Worst case: restore once to plain files and re-back-up with borg. | hours |
| **A tenant container** | Its state is one directory. `docker run` a different image against the same volume. | minutes |
| **PocketBase**, if ever adopted for one project | MIT, single static binary, plain SQLite: `sqlite3 pb_data/data.db .dump`. The last released binary keeps working indefinitely. | **a `.dump`** |
| **The whole platform** | Every project is a container + a volume + a DNS name. Point the DNS elsewhere, `rsync /srv/data`, run the same images. There is **no platform-specific data format anywhere** — that is the point of the pattern. | a day |

The lock-in worry is right in general and small here, because **the only component
with any lock-in potential is the one holding the user list, and it holds it in a
YAML file**.

---

## 13. Verification status

Measured locally 2026-09-13: `server/Dockerfile` is `FROM node:20-alpine`;
`src/adapters/` has exactly one `fetch` call site (`sheets/sheetsApi.ts:72`);
`localRepository.ts` is 157 lines.

Verified against primary sources, all checked **2026-09-13**:

| Fact | Source |
| --- | --- |
| PocketBase v0.40.4 (2026-09-12), MIT, 61 029 stars, 19 open issues; created 2022-07-05 | [GitHub API](https://api.github.com/repos/pocketbase/pocketbase) |
| `ganigeorgiev` 2 482 commits vs 5 for the next contributor; 998 of ~1000 commit-author slots in 12 months | [contributors API](https://api.github.com/repos/pocketbase/pocketbase/contributors), commits API since 2025-09-13 |
| *"NOT recommended for production critical applications yet"*; *"no promises for maintenance"*; donations refused; FLOSS/fund grant cancelled | [docs](https://pocketbase.io/docs/), [FAQ](https://pocketbase.io/faq/), [#7287](https://github.com/pocketbase/pocketbase/discussions/7287) |
| v0.40.0 breaking notes; v0.23 upgrade *"1h to entire weekend"*; 0.22.x backport line (v0.22.55, 2026-09-06) | [CHANGELOG](https://raw.githubusercontent.com/pocketbase/pocketbase/v0.40.4/CHANGELOG.md), [v023upgrade](https://pocketbase.io/v023upgrade/go/) |
| Backups: ZIP of `pb_data` excluding S3 files; `Cron` + `CronMaxKeep` (default 3); `POST /api/backups/{key}/restore` restarts the process; 5 GB+ advice; manual copy requires the app stopped | [going-to-production](https://pocketbase.io/docs/going-to-production/), [api-backups](https://pocketbase.io/docs/api-backups/), [`core/settings_model.go`](https://raw.githubusercontent.com/pocketbase/pocketbase/v0.40.4/core/settings_model.go) |
| 32 OAuth2 providers incl. generic `oidc`; MFA = any 2 of {password, OAuth2, OTP}; no TOTP/SMS; `AuthToken` default 432 000 s; stateless, no logout endpoint, no per-token revocation | [`tools/auth` @ v0.40.4](https://github.com/pocketbase/pocketbase/tree/v0.40.4/tools/auth), [authentication](https://pocketbase.io/docs/authentication/), [`collection_model_auth_options.go`](https://raw.githubusercontent.com/pocketbase/pocketbase/v0.40.4/core/collection_model_auth_options.go) |
| Passkeys not supported ([#6800](https://github.com/pocketbase/pocketbase/issues/6800) open, Backlog); **not an OAuth2 provider** ([#1144](https://github.com/pocketbase/pocketbase/discussions/1144)) | as linked |
| API rules grammar and limits; realtime is SSE; files public-by-URL unless Protected | [api-rules-and-filters](https://pocketbase.io/docs/api-rules-and-filters/), [api-realtime](https://pocketbase.io/docs/api-realtime/), [files-handling](https://pocketbase.io/docs/files-handling/) |
| SQLite WAL, ~120 readers / 1 writer; *"Only on a single server"*; Litestream recommended; transactions minimised as an *"accepted tradeoff"* | [FAQ](https://pocketbase.io/faq/), [#4209](https://github.com/pocketbase/pocketbase/discussions/4209), [SECURITY.md](https://github.com/pocketbase/pocketbase/blob/master/.github/SECURITY.md) |
| Three advisories; CVE-2026-82410 (High 8.7) **absent from NVD/OSV**; CVE-2026-44166 scored Moderate by GitHub and High 7.6 by NVD; ~24 h pre-announcement then same-day release | [advisories](https://github.com/pocketbase/pocketbase/security/advisories), [GHSA-pq7p-mc74-g65w](https://github.com/advisories/GHSA-pq7p-mc74-g65w), [GHSA-m93w-4fxv-r35v](https://github.com/advisories/GHSA-m93w-4fxv-r35v), [NVD](https://services.nvd.nist.gov/rest/json/cves/2.0?cveId=CVE-2026-82410) |
| Trusted-proxy config is a header allowlist with a spoofing warning and **no CIDR allowlist** | [`core/settings_model.go`](https://raw.githubusercontent.com/pocketbase/pocketbase/v0.40.4/core/settings_model.go), [going-to-production](https://pocketbase.io/docs/going-to-production/) |
| Appwrite: ~40 compose services (39 enumerated), 2 CPU / 4 GB RAM / 2 GB swap, v2.1.0 | [install docs](https://appwrite.io/docs/advanced/self-hosting/installation), [`docker-compose.yml`](https://raw.githubusercontent.com/appwrite/appwrite/main/docker-compose.yml) |
| Caddy `forward_auth`: 2xx → continue + `copy_headers`, non-2xx → returned to client; **Authelia is the documented example** | [Caddy docs](https://caddyserver.com/docs/caddyfile/directives/forward_auth) |
| Authelia v4.39.26 (2026-09-12), Apache-2.0, 28 948 stars; session defaults **1 h expiration / 5 min inactivity / 1 month remember-me**, `-1` disables; session providers memory (default) / Redis / Redis Sentinel; storage Postgres / **SQLite3** / MySQL; file provider is YAML with **argon2** default, hot-reloaded with `watch: true`; passkeys incl. `enable_passkey_login`; **OIDC provider is "open beta"**; **401 for XHR, 302 for GET/OPTIONS, 303 otherwise** | [session](https://www.authelia.com/configuration/session/introduction/), [redis](https://www.authelia.com/configuration/session/redis/), [sqlite storage](https://www.authelia.com/configuration/storage/sqlite/), [file provider](https://www.authelia.com/configuration/first-factor/file/), [webauthn](https://www.authelia.com/configuration/second-factor/webauthn/), [OIDC provider](https://www.authelia.com/configuration/identity-providers/openid-connect/provider/), [proxies](https://www.authelia.com/integration/proxies/introduction/), [standalone deployment](https://www.authelia.com/integration/deployment/docker/) |
| Authelia **source-confirmed**: `getAuthzRedirectStatusCode` returns 401 `if ctx.IsXHR() \|\| !ctx.AcceptsMIME("text/html")`; `IsXHR()` checks only `X-Requested-With`; `AcceptsMIME` counts `*/*` only at index 0; `setSpecialRedirect()` whitelists 401 and still sets `Location`; inactivity slides via `LastActivity`; **remember-me short-circuits the inactivity check**; `UpdateExpiration` is called only at login, so the cookie expiry does not slide. In-memory sessions are lost on restart — *"Not configuring redis leaves Authelia stateful"* | `internal/handlers/handler_authz_util.go`, `handler_authz_authn.go`, `internal/middlewares/authelia_context.go` @ [authelia/authelia](https://github.com/authelia/authelia); [#6911](https://github.com/authelia/authelia/discussions/6911) |
| Authelia advisories: **7 total, one High/Critical** — CVE-2021-32637 (nginx authz bypass, fixed 4.29.3, 2021-05-28); then CVE-2021-29456 (Moderate), GHSA-x883-2vmg-xwf7 (Low, file-backend group changes, 4.38.0), CVE-2025-24806 (Low), CVE-2026-33525 (Low, XSS, 4.39.15 only), CVE-2026-47203 and CVE-2026-48794 (both fixed 4.39.20, 2026-05-26). Support: *"To the last 3 minor versions upon request"*. **CVE-2023-6545 belongs to Beckhoff's fork, not upstream.** | [advisories](https://github.com/authelia/authelia/security/advisories), [versioning policy](https://www.authelia.com/policies/versioning/) |
| Tinyauth decides by User-Agent regex `Chrome\|Gecko\|AppleWebKit\|Opera\|Edge`, returning 302 to browsers and 401 + `x-tinyauth-location` otherwise; advisory GHSA-r27r-rr9v-vv37 (8.1) concerns the `path.allow` bypass | `internal/controller/proxy_controller.go` @ v5.2.0, [tinyauth](https://github.com/tinyauthapp/tinyauth) |
| Authentik 2026.8.2; official compose = `postgresql`, `server`, `worker` (Redis removed in 2025.10: *"fully removing the need for Redis"*); *"at least 2 CPU cores and 2 GB of RAM"*; backed by Authentik Security Inc., a public benefit company funded by Open Core Ventures | [compose](https://goauthentik.io/docker-compose.yml), [install docs](https://docs.goauthentik.io/install-config/install/docker-compose/), [2025.10 release](https://docs.goauthentik.io/releases/2025.10/) |
| Authentik forward-auth returns `StatusCode::FOUND` (302) unconditionally, with no `Accept`/`X-Requested-With`/`Sec-Fetch-*` check in the handler path; `access_token_validity` default `hours=1`, outpost cookie = that + 1 s; `session_duration` default *"until the browser is closed"*; sessions do not slide; a PWA redirect bug existed and was fixed | [forward.rs](https://github.com/goauthentik/authentik/blob/main/src/outpost/proxy/application/handlers/forward.rs), [user_login/models.py](https://github.com/goauthentik/authentik/blob/main/authentik/stages/user_login/models.py), [#14304](https://github.com/goauthentik/authentik/issues/14304), [#6886](https://github.com/goauthentik/authentik/issues/6886) |
| Authentik: **47 advisories (6 Critical, ~26 High)**; CVE-2026-25748 *"Forward-authentication bypass with malformed session cookie on Traefik and Caddy"* (High 8.6) and GHSA-5wcc-hf24-rf5h (High 8.7, `X-Original-URI`); only `2026.5.x` / `2026.8.x` supported | [advisories](https://github.com/goauthentik/authentik/security/advisories) |
| Pocket ID: **13 advisories**, worst GHSA-rm8c-2cv8-jwf6 **Critical 9.6**; **no TOTP and no recovery codes, both closed as not planned**; per-client token durations since v2.13.0 with a **365-day maximum**; *"we don't have a built-in proxy provider"* | [advisories](https://github.com/pocket-id/pocket-id/security/advisories), [repo](https://github.com/pocket-id/pocket-id) |
| Pocket ID v2.14.0, BSD-2, 9 181 stars, **passkey-only**, *"OpenID Connect Certified™ and OAuth 2.0 provider"*, requires HTTPS (secure context) | [repo](https://github.com/pocket-id/pocket-id), [install](https://pocket-id.org/docs/setup/installation) |
| Tinyauth v5.2.0 (2026-09-07), **AGPL-3.0**, 8 247 stars, single maintainer (638 vs 10), *"OpenID Certified™ for Basic OP"* since v5.1.0 (2026-06-25), *"configuration may change often"* | [repo](https://github.com/tinyauthapp/tinyauth) |
| oauth2-proxy v7.15.4, MIT, 14 950 stars, consumer only | [repo](https://github.com/oauth2-proxy/oauth2-proxy) |
| Immich mobile app cannot work behind `forward_auth`; the recommended fix is OIDC | [#3118](https://github.com/immich-app/immich/discussions/3118), [#23831](https://github.com/immich-app/immich/discussions/23831), [Authelia × Immich](https://www.authelia.com/integration/openid-connect/immich/) |
| ITP's 7-day cap covers *"non-cookie website data"*; WebKit storage policy exempts *"origins in persistent mode"*, granted *"based on heuristics like whether the website is opened as a Home Screen Web App"* (2023-08-10) | [ITP 2.3](https://webkit.org/blog/9521/intelligent-tracking-prevention-2-3/), [storage policy](https://webkit.org/blog/14403/updates-to-storage-policy/) |
| SQLite: background file copies *"might contain some old and some new content, and thus be corrupt"*; safe paths are `sqlite3_rsync` (3.47.0, 2024-10-21), `VACUUM INTO`, the backup API; *"If a database file is separated from its WAL file, then transactions that were previously committed… might be lost, or the database file might become corrupted"*; `VACUUM INTO` is *"transactional"* and *"(but not VACUUM INTO)"* is exempted from being a write; the backup API *"may never run to completion"* if restarted often enough | [howtocorrupt](https://www.sqlite.org/howtocorrupt.html), [wal](https://www.sqlite.org/wal.html), [lang_vacuum](https://www.sqlite.org/lang_vacuum.html), [backup](https://www.sqlite.org/backup.html) |
| Borg quickstart: *"Shut down containers before backing up their storage volumes."* | [quickstart](https://borgbackup.readthedocs.io/en/stable/quickstart.html) |
| Postgres: `pg_dump` *"does not block other operations"*; `pg_basebackup` works on a **running** cluster; a filesystem copy requires *"The database server **must** be shut down"*; dumps *"cannot be used as part of a continuous-archiving solution"*; **PG 18 reworded "backups" → "exports"** and added a caveat against regular production backups | [backup-dump](https://www.postgresql.org/docs/current/backup-dump.html), [app-pgbasebackup](https://www.postgresql.org/docs/current/app-pgbasebackup.html), [backup-file](https://www.postgresql.org/docs/current/backup-file.html), [continuous-archiving](https://www.postgresql.org/docs/current/continuous-archiving.html), [PG18 pg_dump](https://www.postgresql.org/docs/current/app-pgdump.html) vs [PG17](https://www.postgresql.org/docs/17/app-pgdump.html) |
| restic 0.19.1 (2026-07-05), BSD-2, ~6-person org, **still 0.x** (compat guaranteed only from 1.0); official Docker image + the **`--hostname` requirement**; `forget` frees nothing without `prune`; `check --read-data` = full re-download, `--read-data-subset` samples; **exit code 3 = partial failure**; S3 Object Lock **closed as not planned** | [releases](https://github.com/restic/restic/releases), [participating](https://restic.readthedocs.io/en/stable/090_participating.html), [installation](https://restic.readthedocs.io/en/stable/020_installation.html), [forget](https://restic.readthedocs.io/en/stable/060_forget.html), [working-with-repos](https://restic.readthedocs.io/en/stable/045_working_with_repos.html), [scripting](https://restic.readthedocs.io/en/stable/075_scripting.html), [#4992](https://github.com/restic/restic/issues/4992) |
| Borg 1.4.5 stable (July 2026), **Borg 2 still beta — `2.0.0b24`, 2026-09-02**, *"(testing releases out, no final release yet)"*; stable is SSH-only, no S3; `borg extract` has no `--target`; `prune` needs `compact` | [releases](https://github.com/borgbackup/borg/releases), [borg-2.0](https://www.borgbackup.org/releases/borg-2.0.html), [extract](https://borgbackup.readthedocs.io/en/stable/usage/extract.html), [prune](https://borgbackup.readthedocs.io/en/stable/usage/prune.html) |
| Litestream v0.5.17 (2026-08-31), Apache-2.0; **Age encryption removed in v0.5.0+**; **exactly one replica per database** | [releases](https://github.com/benbjohnson/litestream/releases), [migration](https://litestream.io/docs/migration/) |
| 3-2-1 verbatim from the US-CERT/CISA publication, itself crediting Peter Krogh (2009) | [CISA PDF](https://www.cisa.gov/sites/default/files/publications/data_backup_options.pdf) |
| Storage prices and egress per §5.4; **Cloudflare R2 does not implement S3 Object Lock** (`x-amz-object-lock-*` all ❌) | [R2 S3 API](https://developers.cloudflare.com/r2/api/s3/api/), plus the §5.4 source list |
| **Watchtower archived 2025-12-17**, last release v1.7.1 (2025-11-11), *"This project is no longer maintained"*; maintainers recommend no fork and warn forks are *"full of AI slop"*; upstream broken on Docker Engine ≥29 (API v1.25 vs v1.44+) | [repo](https://github.com/containrrr/watchtower), [#2135](https://github.com/containrrr/watchtower/discussions/2135), [#2132](https://github.com/containrrr/watchtower/issues/2132) |
| Docker's own words: publishing a port *"gets diverted before it goes through the `ufw` firewall settings"*; env vars *"can also be printed in logs… without your knowledge"*; Compose secrets mount at `/run/secrets/` | [packet-filtering-firewalls](https://docs.docker.com/engine/network/packet-filtering-firewalls/), [use-secrets](https://docs.docker.com/compose/how-tos/use-secrets/) |
| Renovate `docker-compose` manager + `pinDigests`; Mend hosted free for *"unlimited… private repositories"*; Dependabot docker-compose **GA 2025-02-25**; `podman auto-update` is first-party with a daily timer | [manager](https://docs.renovatebot.com/modules/manager/docker-compose/), [docker](https://docs.renovatebot.com/docker/), [mend-hosted](https://docs.renovatebot.com/mend-hosted/overview/), [Dependabot GA](https://github.blog/changelog/2025-02-25-dependabot-version-updates-now-support-docker-compose-in-general-availability/), [podman](https://docs.podman.io/en/latest/markdown/podman-auto-update.1.html) |
| `unattended-upgrades` *"auto-installs security updates, but not new features"*; **`Automatic-Reboot` defaults to `false`** | [Debian wiki](https://wiki.debian.org/UnattendedUpgrades), [50unattended-upgrades.Debian](https://github.com/mvo5/unattended-upgrades/blob/master/data/50unattended-upgrades.Debian) |
| Caddy v2.11.4 (2026-06-03); automatic HTTPS obtains, renews and redirects HTTP→HTTPS; **HSTS is not set by default** — proposal #4751 still open. Let's Encrypt 90-day default, 6-day `shortlived` GA 2026-01-15, 45-day cap by Feb 2028. hstspreload.org: *"cannot easily be undone… takes months"* | [automatic-https](https://caddyserver.com/docs/automatic-https), [#4751](https://github.com/caddyserver/caddy/issues/4751), [cert-lifetimes](https://letsencrypt.org/docs/cert-lifetimes/), [6-day GA](https://letsencrypt.org/2026/01/15/6day-and-ip-general-availability), [hstspreload.org](https://hstspreload.org/) |
| fail2ban 1.1.1 (2026-08-15); default action writes to `INPUT` while container traffic traverses `FORWARD`. CrowdSec v1.8.1 (2026-09-03, MIT); *"The Security Engine by itself is a detection engine — it will not block anything"*; Caddy and Traefik bouncers are proxy modules, not sidecars | [fail2ban releases](https://github.com/fail2ban/fail2ban/releases), [#2292](https://github.com/fail2ban/fail2ban/issues/2292), [CrowdSec docker install](https://docs.crowdsec.net/u/getting_started/installation/docker/), [caddy bouncer](https://github.com/hslatman/caddy-crowdsec-bouncer) |
| grype v0.118.0 (2026-08-27, fully local); Trivy v0.74.0 (2026-08-14); Docker Scout Personal = 1 enabled repo | [grype](https://github.com/anchore/grype/releases), [trivy](https://github.com/aquasecurity/trivy/releases), [Docker pricing](https://www.docker.com/pricing/) |
| Tailscale free Personal: **up to 6 users, unlimited devices**; Standard $8/user/mo; **Funnel is public internet exposure**; node keys expire by default and "block connections without VPN" breaks DNS/LAN/everything on expiry. Headscale v0.29.3 (2026-07-29), 0.x, *"not associated with Tailscale Inc."* | [pricing](https://tailscale.com/pricing), [funnel](https://tailscale.com/kb/1223/funnel), [#8057](https://github.com/tailscale/tailscale/issues/8057), [#12220](https://github.com/tailscale/tailscale/issues/12220), [#13407](https://github.com/tailscale/tailscale/issues/13407), [headscale](https://github.com/juanfont/headscale) |
| Web Push needs no inbound reachability: the push service *"deliver[s] these messages back to the user agent"* over the UA's own connection | [RFC 8030](https://www.rfc-editor.org/rfc/rfc8030.html) |
| healthchecks.io free: **20 checks**, 100 log entries/check; self-hostable, BSD-3, v4.4 | [pricing](https://healthchecks.io/pricing/), [repo](https://github.com/healthchecks/healthchecks) |
| sops v3.13.3 (MPL-2.0, 23 105 stars); age v1.3.2; CrowdSec v1.8.1 (MIT, 14 833 stars); Directus v12.3.1; Hetzner CX23 €5.49/mo excl. VAT after 2026-06-15 | GitHub APIs; [Hetzner price adjustment](https://docs.hetzner.com/general/infrastructure-and-availability/price-adjustment/) |

**NOT VERIFIED — re-check before relying on any of these:**

- **oauth2-proxy's advisory record** and Tinyauth's beyond GHSA-r27r-rr9v-vv37.
  Authelia (7), Authentik (47) and Pocket ID (13) were enumerated; these two were
  not.
- **Whether Authelia ships SQL-backed sessions**, which would remove the
  restart-drops-sessions problem without Redis. Discussed upstream as planned;
  **not verified as shipped.**
- **RAM floors** for Authelia, Pocket ID, Tinyauth, oauth2-proxy, and PocketBase.
- **CrowdSec free-tier limits** (the pricing page does not enumerate them);
  **Cloudflare Access "50 users free"** (secondary sources only — and it is a third
  party in the data path, so it is out of scope under ADR 0003's N3 anyway).
- **Scaleway's per-request fee schedule**; AWS Glacier Deep Archive pricing in
  `eu-central-1` (the `eu-west-1` figure is solid; use Ireland). **NOT VERIFIED as
  vendor guidance:** the chmod-600-`.env`-outside-the-repo pattern, and any sops
  documentation about committing encrypted files to git.
- **Official guidance on backing up SQLite or Postgres inside Docker: none exists.**
  sqlite.org says nothing about Docker, and `docker-library/docs/postgres` contains
  zero occurrences of "backup", "dump" or "restore". Every recipe in §5 is
  composition from primary primitives, not a blessed pattern.
- **No credible dataset on how stale self-hosted deployments actually become.** The
  best available evidence for this ADR's thesis is anecdotal-but-damning: Watchtower
  itself, and `server/Dockerfile`'s EOL base image in this repository.
- **Whether any Watchtower fork is trustworthy** (`nicholas-fedor` is active but
  un-endorsed and single-maintainer).
- **PocketBase:** report→fix intervals; whether its built-in backup snapshots SQLite
  consistently; restore-from-S3 onto a fresh instance; any LTS commitment for
  0.22.x.

**Nothing here moves the decision except the first item.** The decision turns on
§1.1 (the slope, crossing at two projects), §4.2 (a platform auth layer must be an
IdP, and PocketBase refuses to be one), and §6.1 (the standard container-patching
advice archived itself, so the plan must be built from loud things rather than
diligent ones). But "Authelia's advisory record was not checked" is a real hole in
a document recommending Authelia, and it is stated here rather than papered over.
