# ADR 0002 — Reminders

- **Status:** accepted
- **Date:** 2026-09-05
- **Deciders:** the maintainer (single-user project)
- **Related:** [ADR 0001 — Where the data lives](0001-data-backend.md),
  [ROADMAP.md](../ROADMAP.md) ("Explicitly not planned: Reminders and push
  notifications")

> This ADR **reverses** a roadmap "not planned" item. The roadmap's reasoning was
> *"they need a server and a push service, and a habit tracker that nags is a
> habit tracker you delete."* Half of that stands: a push service is genuinely
> unavoidable. The other half is answered by design — the decision of *whether*
> to nag is taken on the device, from local state, and never by the server.

---

## 1. What is wanted

1. **Late evening** (~21:30, configurable): remind me to fill in the day that is
   ending — **only if it is not already done**.
2. **Morning** (07:20, configurable): remind me to fill in *yesterday* if it was
   missed, ideally saying that the last N days are unfilled.

Both requirements contain the word *only*. That word is the whole ADR: an
unconditional alarm is trivial and useless, and a conditional reminder needs
something, somewhere, to know whether the day is filled.

## 2. The constraint that decides everything

**A server that decides whether to remind would have to know whether the day is
filled.** That single bit, sent daily, is behavioural data about a health
journal, held on a machine the maintainer operates. It would convert the
project's strongest property — *the maintainer cannot see your data, by
construction* — into a promise. ADR 0001 rejects every storage option for the
same reason; it would be incoherent to give the property away for a nag.

There is a second, harder constraint, inherited from ADR 0001 §3.5:

> The OAuth access token lives in a JavaScript variable and dies with the tab.
> There is no refresh token, no client secret, and the scope is `drive.file`.

So **nothing running in the background can read the spreadsheet** — not a server,
not a Cloud Function, and *not the service worker either*. Any design in which
something wakes up at 07:20 and *checks* the data is impossible without
fundamentally weakening the auth model (a stored refresh token, i.e. a persistent
credential that can read the user's file, sitting in a browser or on a server).

That is not a limitation to work around. It is the shape of the correct answer:
**the wake-up must carry no information, and the decision must be made from state
already on the device.**

## 3. Decision drivers

| # | Driver |
| --- | --- |
| **D1** | The maintainer must not learn anything about the user's data — including "did he fill in yesterday". |
| **D2** | No stored long-lived credential able to read the user's spreadsheet. |
| **D3** | Fires reliably at a chosen time, on the owner's actual phone. |
| **D4** | Conditional: silent on days already filled. A nag on a completed day is worse than no reminder. |
| **D5** | ~€0/month, and near-zero operational attention. |
| **D6** | Terraform-provisionable if there is infrastructure at all. |
| **D7** | Ship something useful before any infrastructure exists. |

---

## 4. What the web platform actually offers

Verified 2026-09-05. Where a claim rests on MDN's browser-compat-data (BCD), the
data was read directly rather than from a blog post.

### 4.1 Web Push (Push API + Notification API)

**How it really works**, because this is where blog posts mislead:

1. The page calls `registration.pushManager.subscribe({ userVisibleOnly: true,
   applicationServerKey })`. The **browser vendor's** push service (FCM for
   Chrome, Mozilla autopush for Firefox, Apple Push for Safari) returns an
   opaque `endpoint` URL plus two client keys (`p256dh`, `auth`).
2. To deliver anything, **someone must POST to that endpoint**
   ([RFC 8030](https://www.rfc-editor.org/rfc/rfc8030.html)), authenticated by a
   VAPID JWT signed with your application server's private key
   ([RFC 8292](https://www.rfc-editor.org/rfc/rfc8292.html)). Payloads, if any,
   are encrypted end-to-end to `p256dh` (RFC 8291), so the *push service* cannot
   read them — but something must hold the endpoint list, hold the VAPID private
   key, and be awake at 21:30 to make the POST. MDN puts it plainly:
   *"knowledge of the endpoint is all that is necessary to send a message to your
   application"* ([Push API](https://developer.mozilla.org/en-US/docs/Web/API/Push_API)),
   which is also why the endpoint list is the one thing worth protecting.
   Two protocol details that bite in implementation: the **`TTL` header is
   mandatory** — RFC 8030 says an application server *"MUST include the TTL …
   header field"* and a push service *"MUST return a 400 (Bad Request)"* without
   it — and `Urgency` is optional (`very-low`/`low`/`normal`/`high`, default
   `normal`). A reminder should be sent with a short TTL: a 21:30 nag delivered
   at 06:00 the next morning because the phone was off is worse than nothing.
3. **That is the server requirement, and it is not optional.** There is no
   browser API to say "deliver this to me later". A static site cannot POST to
   its own users' endpoints at 21:30 because nothing is running at 21:30.

**Support** (MDN BCD, `api.PushManager`, read 2026-09-05):

| | `PushManager` | `showNotification` |
| --- | --- | --- |
| Chrome / Edge (desktop + Android) | 42 / 17 | 42 |
| Firefox | 44 | 44 |
| Safari (macOS) | 16 | 16 |
| **Safari (iOS/iPadOS)** | **16.4** | **16.4** |

**Desktop Safari is the pleasant surprise:** Safari 16 on macOS Ventura+ supports
Web Push for **ordinary sites in a tab, with no installation**, delivered by a
`webpushd` system daemon so pushes arrive even when Safari is not running
([Meet Web Push](https://webkit.org/blog/12945/meet-web-push/)). A user gesture
and `userVisibleOnly: true` are required.

**iOS is the constraint, and it is still a constraint.** Verified 2026-09-05:

- Web Push arrived in **iOS/iPadOS 16.4**, explicitly *"for Home Screen web
  apps"*, requiring permission in response to direct user interaction and no
  Apple Developer Program membership
  ([WebKit, 2023-02-16](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)).
- **It is still Home-Screen-only.** MDN's browser-compat-data note on
  `api.Notification` for `safari_ios: 16.4` is marked
  `partial_implementation` and reads: *"The `Notification` interface is
  **undefined**, unless the page is a web app saved to the home screen. **The
  app's manifest must have a non-default `display` value.**"* The
  `api.PushManager` note agrees: *"Notifications are supported in web apps saved
  to the home screen."* Checked in this repo: `public/manifest.webmanifest`
  already sets `"display": "standalone"`, so that prerequisite is met — but it is
  now a load-bearing line, and changing it to the default would silently disable
  notifications on iOS.
- **Declarative Web Push** (a JSON payload the browser renders without waking a
  service worker) shipped in iOS/iPadOS 18.4 and macOS 15.5
  ([WebKit, 2025-03-27](https://webkit.org/blog/16535/meet-declarative-web-push/)),
  and **did not lift the Home Screen requirement** — it is described for "web
  apps saved to the Home Screen" on iOS. Interesting for reliability, useless for
  this design, since the entire point is that the *service worker* decides the
  content.
- The current [Safari 26.6 features post](https://webkit.org/blog/18178/webkit-features-for-safari-26-6/)
  mentions push, notifications, Home Screen and web apps **not at all** — no
  relaxation found.
- **EU / DMA:** alternative (non-WebKit) browser engines are permitted on iOS
  17.4+ / iPadOS 18+ in the EU, via entitlement, EU-distribution-only
  ([Apple](https://developer.apple.com/support/alternative-browser-engines/)).
  Whether any such engine has actually shipped, and whether it could deliver
  push to a non-installed site, is **unverified** (§11).

Practical consequences: the PWA must be installed on iOS; removing it from the
Home Screen destroys the subscription; and **there is no way to reach an iOS user
who has not installed it.**

Also from BCD, and relevant to notification *design* rather than delivery:
`showNotification`'s `actions`, `requireInteraction`, `badge`, `data`, `image`
and `renotify` options are **`false` on Safari and Safari iOS**. So a "Remplir
maintenant" action button and a sticky notification are Chrome-only luxuries; the
notification body plus a click-to-open must carry the whole message.

### 4.2 Notification Triggers (`TimestampTrigger` / `showTrigger`) — do not use

This is exactly the API this feature wants: schedule a notification locally, at a
timestamp, with the service worker deciding the content — no server, no push
service, no privacy cost.

**It never shipped, and Google publicly ended its development.** Verified
2026-09-05, four independent ways:

1. **Chrome's own documentation carries a warning banner:** *"The development of
   Notification Triggers API, part of Google's capabilities project, has ended.
   It wasn't clear that we could provide consistent and reliable experiences
   across platforms."* The page sits under the navigation section **"No longer
   pursuing"**.
   [developer.chrome.com/docs/web-platform/notification-triggers](https://developer.chrome.com/docs/web-platform/notification-triggers)
2. **Chrome Platform Status** (feature 5133150283890688) still reads
   **"In developer trial (Behind a flag)"**, with `origintrial: false`,
   `flag: true`, and **no ship milestone at all** — `desktop`, `android`,
   `webview` and `ios` are all `null`. Firefox and Safari positions: *"No
   signal"*. Spec: *"being incubated in a Community Group"*, `spec: null`. Entry
   last touched **2022-09-13**. (Fetched via
   `https://chromestatus.com/api/v0/features/5133150283890688`, because the human
   page is a JS app.) Note it is **not** labelled "removed" — it is *frozen* at
   developer trial, which is a more accurate and less flattering status.
3. **`WICG/notification-triggers` does not exist** (HTTP 404). The explainer
   lives at [beverloo/notification-triggers](https://github.com/beverloo/notification-triggers),
   which is not archived but has had **no push since 2019-09-06**.
4. **MDN has no pages for it:** `/Web/API/TimestampTrigger` and
   `/Web/API/Notification/showTrigger` both 404.

And the cleanest structural evidence: MDN's browser-compat-data tracks *every*
option of
`ServiceWorkerRegistration.showNotification` individually —
`options_actions_parameter`, `options_badge_parameter`, `options_data_parameter`,
`options_image_parameter`, `options_renotify_parameter`,
`options_requireInteraction_parameter`, `options_vibrate_parameter` — including
options supported by Chrome alone. **There is no `showTrigger` entry, and no
`TimestampTrigger` interface, anywhere in BCD.** For an API whose whole audience
was Chromium, absence from a dataset that records Chromium-only options is
conclusive: there is nothing to feature-detect and nothing to ship.

*(Cross-check before quoting this in public: the Chrome Platform Status entry for
"Notification Triggers" and the state of the `WICG/notification-triggers`
repository — expected to be abandoned/archived. Flagged as **not
independently re-fetched** in §11. The BCD absence is what this ADR relies on.)*

**Anyone who tells you to use `showTrigger` is reading a 2020 blog post.** There
is nothing to feature-detect and nothing to ship. Google's stated reason —
*"it wasn't clear that we could provide consistent and reliable experiences
across platforms"* — is also a warning about the whole problem space, and worth
keeping in mind while reading §4.3.

### 4.3 Periodic Background Sync

**Support** (MDN BCD, `api.PeriodicSyncManager` and
`api.ServiceWorkerRegistration.periodicSync`, read 2026-09-05):

| Browser | Support |
| --- | --- |
| Chrome / Chrome Android | **80** |
| Edge | 80 (mirrors Chrome) |
| **Firefox** | **`false` — never implemented** |
| **Safari / Safari iOS** | **`false` — never implemented** |

Additional requirements and behaviour:

- **The PWA must be installed.** Chrome's documentation: *"A web app can only use
  periodic background sync after a person has installed it on their device, and
  has launched it as a distinct application. Periodic background sync is not
  available in the context of a regular tab in Chrome."*
- **The 12-hour floor is in the specification, not just a Chrome quirk.** The
  spec defines a "minimum periodic sync interval for any origin" and, *"If
  undefined, these are set to **43200000**, which is twelve hours in
  milliseconds."*
  ([Periodic Background Sync spec](https://wicg.github.io/periodic-background-sync/index.html))
- **Firing is gated on the site-engagement score.** Chrome: *"Chrome is using a
  site engagement score (`about://site-engagement/`) to determine if and how
  often periodic background syncs can happen"*, and *"a `periodicsync` event
  won't be fired at all unless the engagement score is greater than zero, and
  its value affects the frequency"*
  ([developer.chrome.com](https://developer.chrome.com/docs/capabilities/periodic-background-sync),
  last updated 2025-08-19). A daily-use app scores well; a neglected one — the
  case where the reminder matters most — scores worse.
- **No wall-clock control, by design.** Same page: *"The timing of
  synchronizations are not controlled by developers. The synchronization
  frequency will align with how often the app is used."* `minInterval` is only a
  requested minimum.
- Events do not fire while the device is offline or the browser is not running.
- Firefox's standards position on the API is recorded as **negative**
  ([mozilla/standards-positions#214](https://github.com/mozilla/standards-positions/issues/214)),
  so the two-engine gap is a decision, not a backlog item.

**Can it be trusted for a 07:20 reminder? No.** It cannot be trusted for any
specific time — that is the API's explicit design. It can be trusted for
"sometime in this half of the day, probably", on Android/Chrome, on an installed
PWA, for a site opened daily (which this one is).

That is still genuinely useful, and it has one property nothing else has:
**zero infrastructure and zero privacy cost.** No server, no push service, no
subscription, no VAPID key, nothing to operate. The decision is entirely local
because the wake-up is entirely local. It is the right *first* mechanism, with
its timing weakness stated honestly.

### 4.4 Local notifications scheduled while a page is open

`setTimeout(() => new Notification(...), ms)` in the page.

**Nearly useless here, and worth saying why precisely:** the timer dies when the
tab is discarded or the PWA is swiped away — which on both Android and iOS is
usually within minutes of backgrounding — and mobile browsers throttle or freeze
timers in background tabs anyway. The one case where the reminder is wanted is
precisely the case where the app is *not* open. It is worth exactly one line of
code as a courtesy for a desktop tab left open all evening, and nothing more.

### 4.5 Non-web fallbacks worth naming

| Mechanism | Fires reliably | Conditional | Infra | Privacy | Notes |
| --- | --- | --- | --- | --- | --- |
| **OS alarm / clock app**, set by hand | Yes, perfectly | **No** | None | Perfect | 30 seconds of setup, zero code. The honest baseline every other option must beat. |
| **Recurring calendar event** with a deep link | Yes | **No** | None | Perfect | Works on every platform including iOS. The app can generate an `.ics` client-side as a `text/calendar` blob — ~20 lines. |
| **`.ics` subscription URL** (webcal, auto-refreshing) | Yes | **No** | Needs a host serving the file — GitHub Pages can | Perfect if static | Only better than a plain event if the schedule changes; it does not. Not worth it. |
| **Telegram / Signal bot** | Yes | Only if the bot knows ⇒ **fails D1** | A server, or a bot token embedded in a public bundle (⇒ anyone can send as your bot) | Poor | Tempting because it is easy. Rejected: the decision would move server-side. |
| **Email** (e.g. a scheduled GitHub Action) | **No — do not rely on it.** GitHub documents, verbatim: *"The `schedule` event can be delayed during periods of high loads of GitHub Actions workflow runs. High load times include the start of every hour. **If the load is sufficiently high enough, some queued jobs may be dropped.**"* Shortest interval is 5 minutes; UTC unless a timezone is given; and *"In a public repository, scheduled workflows are automatically disabled when no repository activity has occurred in 60 days"* — which is this repository ([docs](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows), checked 2026-09-05) | **No** (unconditional) or fails D1 | A workflow + an SMTP secret | Fine while unconditional | Zero-cost Plan C for an *unconditional* nag, but "jobs may be dropped" and "disabled after 60 days of inactivity" make it unsuitable as the primary trigger for anything you care about. Notably this also rules out GitHub Actions as a substitute for Cloud Scheduler in §6. |
| **Thin native shell** (Capacitor / a WebView wrapper) | Yes | **Yes** — local scheduled notifications, decided on-device | A build pipeline, signing, sideloading or a store presence | Perfect | **On iOS this is the only way to get a conditional, precisely-timed reminder with no server at all.** The roadmap rejects a native app; that rejection is worth revisiting only if the push design proves unreliable on the owner's actual phone. |

---

## 5. The recommended design: a content-free tick, decided locally

```
   Cloud Scheduler                Cloud Run job                push service            device
   ┌────────────────┐             ┌──────────────────┐          ┌──────────┐        ┌──────────────────┐
   │ */5 * * * *    │──OIDC──────▶│ for each sub     │──POST───▶│ FCM /    │───────▶│ service worker   │
   │ one cron job   │             │ whose minute ==  │  VAPID   │ Mozilla /│  push  │ 'push' handler   │
   └────────────────┘             │ now: POST tick   │  (empty  │ Apple    │        │                  │
                                  │                  │  body)   └──────────┘        │ reads IndexedDB: │
                                  │ knows: endpoint, │                              │ which days are   │
                                  │ two minutes/day  │                              │ unfilled?        │
                                  │ knows NOT: name, │                              │                  │
                                  │ email, data,     │                              │ decides: show or │
                                  │ whether filled   │                              │ stay silent      │
                                  └──────────────────┘                              └──────────────────┘
```

The push carries **no payload at all** (or a constant one). The server cannot
compose a message about the user's data because it does not have the user's data
and could not decrypt the spreadsheet if it did. All the intelligence — *should I
show anything? what should it say? how many days are missing?* — happens in the
`push` event handler on the device.

### 5.1 What the service worker can actually read

This is the load-bearing engineering question, and the current code answers it
badly:

- **`localStorage` is not available in a service worker.** It is a
  main-thread-only, synchronous API. So today the SW can read **nothing**:
  `src/lib/settings.ts` keeps preferences at `habits-tracker:settings` and
  `localRepository` keeps the entire local dataset at `habits-tracker:local`,
  both in `localStorage`, both invisible to `sw.js`.
- **IndexedDB is available in a service worker.** So is the Cache API.
- **The spreadsheet is not readable**, at 07:20 or ever, per §2. No token.

Therefore the design needs one small addition: **a "reminder state" record in
IndexedDB, written by the page, read by the service worker.** Not the data — just
the derived facts a reminder needs:

```ts
// one object store, one record, written on every successful load() and saveDay()
{
  updatedAt: '2026-09-05T21:12:04.881Z',
  // Days that are due-but-incomplete, most recent first, capped at ~30.
  // Derived from the snapshot with core/stats.ts, which already computes
  // exactly this (`DaySummary.complete`, over metrics actually due that day).
  unfilled: ['2026-09-04', '2026-09-02', '2026-08-31'],
  today: '2026-09-05',              // the last day the page evaluated
  evening: '21:30', morning: '07:20', tz: 'Europe/Paris',
  enabled: { evening: true, morning: true },
}
```

Three things make this cheap rather than a new subsystem:

- `core/stats.ts` **already** computes `DaySummary.complete` "over the metrics
  actually due that day" — including schedules, so a weekend with no due metrics
  is not "unfilled". The record is a projection of something the dashboard
  already renders, not new logic.
- It is ~40 lines: one `idb` open/get/put helper (hand-written, no dependency —
  consistent with a project that has two), one write in `useTracker` after a
  successful load/save, one read in `sw.js`.
- ADR 0001 §6 already recommends moving `localRepository` to IndexedDB
  independently. These converge.

The record contains health data (which days are incomplete), so it stays on the
device and is never sent anywhere. That is the same trust boundary as the
existing `localStorage` data.

### 5.2 What the server learns, stated exactly

Per subscription record, the server holds:

| Field | What it reveals |
| --- | --- |
| `endpoint` (opaque URL at `fcm.googleapis.com` / `updates.push.services.mozilla.com` / `web.push.apple.com`) | Which browser vendor. A stable pseudonymous device id. |
| `p256dh`, `auth` | Nothing — encryption keys. |
| `eveningMinute`, `morningMinute` (minute-of-day, UTC, derived) | Approximate time zone, and that someone wants reminders at roughly 21:30 and 07:20 local. |
| `tz` (IANA name, if stored — see §5.3) | The time zone explicitly. |

It holds **no** user id, no email, no name, no metric, no answer, no date, and —
critically — **nothing that varies with whether the form was filled**. Two
subscriptions are indistinguishable except by their times. The server's log of
"pushed to endpoint X at 21:30" says only that the device was configured for a
reminder, which the user already knew.

Compare with the naive design ("the server checks and sends 'you missed 3
days'"): that server holds a daily, timestamped record of the user's adherence to
a health journal. The gap between the two is the entire value of this ADR.

### 5.3 Time zones and configurable times

The user sets `21:30` and `07:20` *local*. The server ticks on UTC. Two ways to
bridge:

- **(a) Store local `HH:MM` + IANA tz; the job converts per run.** Correct across
  DST automatically. Cost: the tz string is explicit in the server's record
  (though a tz is already inferable from the request IP that registered).
  **Recommended** — correctness beats hiding `Europe/Paris`.
- **(b) Store UTC minutes only; the client re-registers when its offset
  changes.** Leaks marginally less. Cost: after a DST change the reminder is an
  hour off until the app is next opened — for an app opened daily, that is
  usually one evening. A legitimate choice if the owner wants the record to be
  literally two integers.

Either way the **scheduler ticks every 5 minutes** and the job pushes only to
subscriptions whose target minute falls in the window. Reminder precision is
therefore ±5 minutes, which is right for "late evening" and fine for 07:20.
(Ticking every minute costs 5× the invocations and is still inside the free
tier; ±5 min is chosen for tidiness, not cost.)

**Why not tick every 5 minutes and push to *everyone*, letting each device check
its own clock?** That is the zero-knowledge ideal — the server would not even
hold a time. It is rejected: 288 pushes per device per day, of which 286 produce
no notification, would drain battery and certainly trip the "must show a
notification" rule in §5.5.

### 5.4 How it degrades when the app has not been opened for a week

Well — this is the design's best property and worth stating, because it is
counter-intuitive.

The IndexedDB record is written when the page last ran. If the app has not been
opened for seven days, the record says `today: '2026-08-29'` and
`unfilled: [seven dates]`. The SW at the next tick sees a record that is stale
*by exactly the amount that matters* and can say, correctly and without any
network access: **"7 jours non remplis depuis le 29 août."** Staleness is not an
error state here, it *is* the signal.

Failure modes, honestly:

- **Filled on another device.** Device B's record is stale, so B nags for a day
  it does not know was filled elsewhere. This is the one false positive, and it
  is inherent: the SW cannot read the truth (§2). At one user with one or two
  devices this is an occasional redundant notification, not a broken feature.
  Notification `tag` de-duplication does nothing across devices. **Accepted.** A
  partial mitigation with no privacy cost: only the device that most recently
  saved is "primary" — but that requires the devices to compare notes, i.e. a
  server, i.e. the thing being avoided. Do not build it.
- **The record has never been written** (fresh install, permission granted but
  app not yet loaded with data). SW shows nothing rather than guessing. Correct.
- **Subscription expired or rotated.** The SW gets `pushsubscriptionchange`; it
  must re-subscribe and re-register. If that fails, reminders silently stop —
  which is why the Settings screen must display "dernier tick reçu : …" so the
  failure is visible rather than silent.
- **Push permission revoked / PWA uninstalled on iOS.** Reminders stop. Visible
  in Settings.

### 5.5 The honest hard part: "a push must show a notification"

What is actually verified (2026-09-05):

- **`userVisibleOnly: true` is mandatory in Chrome and Edge.** MDN: *"This
  parameter is required in some browsers like Chrome and Edge. They will reject
  the Promise if `userVisibleOnly` is not set to `true`."*
  ([PushManager.subscribe](https://developer.mozilla.org/en-US/docs/Web/API/PushManager/subscribe))
- **Chrome states the intent unambiguously.** Its error text is *"Chrome
  currently only supports the Push API for subscriptions that will result in
  user-visible messages"*, and the guidance says *"blanket silent push will not
  be implemented in Chrome"*, with a *budget API* for a **limited** number of
  silent pushes having been explored
  ([web.dev](https://web.dev/articles/push-notifications-subscribing-a-user)).
  So: a *bounded* number of silent pushes is contemplated; an unbounded stream is
  explicitly not.
- **The specification leaves enforcement discretionary.** *"the user agent MAY
  consider these options when requesting express permission… When an option is
  considered, the user agent SHOULD enforce it on incoming push messages."*
  ([Push API, W3C](https://www.w3.org/TR/push-api/)) MAY and SHOULD, not MUST —
  which means the real behaviour is a per-browser implementation detail that can
  change without a spec change. That is precisely why this ADR does not build a
  design that depends on a generous budget.
- **What could not be verified:** the exact fallback string Chrome shows (widely
  reported as *"This site has been updated in the background"*, but only in
  secondary sources — no primary Google documentation found), and the current
  numeric budget. Flagged in §11. **Treat "how many silent pushes are tolerated"
  as unknown**, and design so the answer does not matter much.

**A design whose whole point is to stay silent on good days is in direct tension
with that rule.** Quantifying the exposure over a year, assuming the owner fills
the form on ~85 % of days:

| Channel | Pushes / year | Notifications shown | **Silent pushes / year** |
| --- | --- | --- | --- |
| Evening 21:30 | 365 | ~330 (the day is usually still unfilled at 21:30 — that is when the form gets filled) | **~35** |
| Morning 07:20 | 365 | ~55 (only when yesterday was missed) | **~310** |

The evening channel is fine: it almost always has something to say. **The morning
channel is the problem** — it is silent ~85 % of the time, which is precisely the
pattern the budget rule exists to punish.

Three ways out, and the recommendation:

1. **Drop the separate morning push and put everything in the evening one
   (recommended).** The evening notification already knows the full picture; make
   its text carry it: *"Journée non remplie — et 2 jours en retard (mer, lun)."*
   Android and iOS both keep an undismissed notification in the shade / Notification
   Center overnight, so an ignored 21:30 notification **is** the 07:20 reminder,
   sitting there when the phone is picked up. On Chrome, `requireInteraction:
   true` makes that explicit (Safari/Firefox: unsupported per BCD §4.1, but their
   default behaviour is already persistent enough). This satisfies both of the
   owner's stated requirements — including "mentioning that the last N days are
   unfilled" — with **one** push a day and ~35 silent pushes a year. It is also
   simply less nagging, which the roadmap cares about.
2. **Keep the morning push and accept ~310 silent pushes/year.** Since the
   tolerated number is undocumented (above), this cannot be reasoned about — only
   measured. Ship variant 1, add the morning channel behind an off-by-default
   setting, and watch for a generic "site updated in the background"
   notification, or for the subscription being dropped. If either happens, the
   answer was no.
3. **Let the client arm/disarm the morning push** by updating its subscription
   record. This removes every silent push — and **leaks one bit per day about
   whether the form was filled**, to a server the maintainer runs. That is a far
   smaller leak than the naive design, and it is still a leak of exactly the
   thing §2 refuses. **Not recommended**, and listed only so the trade is on the
   record rather than discovered later. If it is ever taken, it must be an
   explicit, off-by-default, clearly-labelled setting.

---

## 6. Cost and Terraform

### 6.1 Shape

The lazy version has **no public HTTP endpoint and no database**, because there
is one user with two devices:

- A **Cloud Run job** (not a service), triggered by **Cloud Scheduler** via OIDC.
- Subscriptions in a **single Secret Manager secret** holding a JSON array — or,
  once there is more than one user or subscriptions rotate often enough to
  annoy, a Firestore collection.
- Registration is manual: the Settings screen shows the subscription JSON with a
  copy button; the owner pastes it into the secret (or a `terraform apply`). This
  removes a public write endpoint, its abuse surface, its rate limiting and its
  auth story — perhaps 200 lines of server code and the only part of the system
  with an attack surface. The cost is re-pasting after a
  `pushsubscriptionchange`, which is rare.

Add the public `POST /subscribe` endpoint (Cloud Run **service**, plus Firestore)
only when self-service registration is actually needed — i.e. when there is a
second user, which ADR 0001 §8 trigger 6 already flags as a different product.

### 6.2 Monthly cost

One cron job every 5 minutes = **288 runs/day ≈ 8 640/month**, each ~1 s at
1 vCPU / 256 MiB. All figures below verified 2026-09-05; **all are the pricing
pages' default region (us-central1)** — the per-region tables are
JavaScript-rendered and `europe-west1` could not be read, so treat the region as
a rounding error on numbers that are already ~zero (§11).

| Resource | Usage at 1 user | Free allowance | Cost |
| --- | --- | --- | --- |
| **Cloud Scheduler** | 1 job | *"Each Google billing account gets 3 jobs per month free… measured at the account level not the project level"*; $0.10/job/31 days beyond | **$0** |
| **Cloud Run job** — vCPU | 8 640 vCPU-s/mo | **240 000 vCPU-s/mo** (jobs bill instance-based, aggregated per billing account) | **$0** (3.6 %) |
| **Cloud Run job** — memory | 2 160 GiB-s/mo | **450 000 GiB-s/mo** | **$0** (0.5 %) |
| **Artifact Registry** (image ~80 MB) | 0.08 GB | 0.5 GB free | **$0** |
| **Secret Manager** — versions | 2 active (VAPID + subscriptions) | **6 active versions free** | **$0** |
| **Secret Manager** — access ops | 8 640 runs × 2 secrets = **17 280/mo** | **10 000 free/mo**, then $0.03/10 000 | **~$0.02** |
| **Cloud Logging** | a few MB | 50 GiB/project/mo | **$0** |
| **Egress** (2 pushes/day, ~2 kB) | ~120 kB/mo | — | **$0** |
| **Total, one user** | | | **≈ $0.02/month** |

And **exactly $0.00** if the scheduler runs `*/15 * * * *` instead: 2 880 runs ×
2 secret reads = 5 760 access operations, inside the free 10 000, at the cost of
±15 minutes of precision. For "late evening" that is free money; if the 07:20
channel is ever enabled, `*/5` and two cents a month is the better trade.

At **1 000 users** the cron count does not change — only the work per run does,
and subscriptions move from a secret to Firestore.

| Resource | Usage at 1 000 users | Cost |
| --- | --- | --- |
| Cloud Scheduler | still 1 job | **$0** |
| Cloud Run job | 8 640 runs × ~2 s ⇒ ~17 280 vCPU-s | **$0** (7 % of the 240 000 free) |
| Firestore, one query per tick returning ~7 docs | ~2 000 reads/day | **$0** (4 % of the 50 000/day free quota) |
| Secret Manager | 1 version (VAPID), 8 640 accesses/mo | **$0** (inside both free tiers) |
| Push sends: 2 000/day × ~2 kB | ~120 MB egress/mo | **~$0.02** |
| **Total, one thousand users** | | **≈ $0.02/month** |

The infrastructure is, to a good approximation, **free at both scales** — which
is exactly why the euro figure must not be the argument.

**The euros are not the cost.** The cost is: a GCP project that must keep a
billing account attached, a container image to rebuild when its base image gets a
CVE, a VAPID keypair that must never be lost (losing it invalidates every
subscription), an OIDC binding that will break the day someone tidies up IAM, and
a silent-failure mode where reminders just stop. Call it **an hour or two a
year, plus one evening of debugging every eighteen months.** That is the real
price, and it is the reason §7 exists and §9 phases it.

*(GCP figures checked 2026-09-05 against the public pricing pages; the free-tier
allowances and Secret Manager unit prices are flagged in §11 — re-derive with the
pricing calculator before committing them to a README.)*

### 6.3 Terraform sketch

```hcl
locals { region = "europe-west1" }

resource "google_project_service" "apis" {
  for_each = toset([
    "run.googleapis.com",
    "cloudscheduler.googleapis.com",
    "secretmanager.googleapis.com",
    "artifactregistry.googleapis.com",
  ])
  service = each.key
}

resource "google_artifact_registry_repository" "images" {
  location      = local.region
  repository_id = "habits-reminders"
  format        = "DOCKER"
}

# The VAPID private key. Created OUT OF BAND (web-push generate-vapid-keys) and
# added as a version by hand, so the key never enters Terraform state.
resource "google_secret_manager_secret" "vapid_private" {
  secret_id = "habits-vapid-private"
  replication { auto {} }
}

# Push subscriptions: a JSON array, pasted in by hand (see §6.1).
resource "google_secret_manager_secret" "subscriptions" {
  secret_id = "habits-push-subscriptions"
  replication { auto {} }
}

resource "google_service_account" "ticker" {
  account_id   = "habits-ticker"
  display_name = "Habits tracker reminder ticker"
}

resource "google_secret_manager_secret_iam_member" "read" {
  for_each  = {
    vapid = google_secret_manager_secret.vapid_private.id
    subs  = google_secret_manager_secret.subscriptions.id
  }
  secret_id = each.value
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.ticker.email}"
}

resource "google_cloud_run_v2_job" "ticker" {
  name     = "habits-ticker"
  location = local.region
  template {
    template {
      service_account = google_service_account.ticker.email
      max_retries     = 1
      timeout         = "60s"
      containers {
        image = "${local.region}-docker.pkg.dev/${var.project}/habits-reminders/ticker:${var.image_tag}"
        resources { limits = { cpu = "1", memory = "256Mi" } }
        env {
          name = "VAPID_PRIVATE_KEY"
          value_source { secret_key_ref {
            secret  = google_secret_manager_secret.vapid_private.secret_id
            version = "latest"
          } }
        }
        env {
          name = "SUBSCRIPTIONS"
          value_source { secret_key_ref {
            secret  = google_secret_manager_secret.subscriptions.secret_id
            version = "latest"
          } }
        }
        env { name = "VAPID_SUBJECT" value = "mailto:${var.contact_email}" }
        env { name = "TICK_WINDOW_MINUTES" value = "5" }
      }
    }
  }
}

# Scheduler needs its own identity to run a Cloud Run job via the Admin API.
resource "google_service_account" "scheduler" { account_id = "habits-scheduler" }

resource "google_cloud_run_v2_job_iam_member" "invoker" {
  name     = google_cloud_run_v2_job.ticker.name
  location = local.region
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.scheduler.email}"
}

resource "google_cloud_scheduler_job" "tick" {
  name = "habits-tick"
  # "*/5" gives ±5 min precision for ~$0.02/mo (Secret Manager access ops).
  # "*/15" is exactly $0.00 and plenty for an evening reminder — see §6.2.
  schedule  = "*/5 * * * *"
  time_zone = "Etc/UTC"           # the job resolves each user's local time itself
  region    = local.region

  http_target {
    http_method = "POST"
    uri         = "https://${local.region}-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/${var.project}/jobs/${google_cloud_run_v2_job.ticker.name}:run"
    oauth_token { service_account_email = google_service_account.scheduler.email }
  }
}
```

Roughly **60 lines of HCL, eight resources, no networking, no database, no public
endpoint.** The container is a ~40-line Node script: read both secrets, compute
the current UTC minute window, filter, POST a VAPID-signed empty push to each
matching endpoint, drop endpoints that return 404/410. *(An alternative worth a
line: `google_cloudfunctions2_function` instead of a job removes the Artifact
Registry resource and the image build, at the cost of a source bucket. Either is
fine; the job is fewer moving parts once a build pipeline exists.)*

---

## 7. The zero-infrastructure fallback, to ship first

Two pieces, both pure client code, both shippable this week with no GCP project
and no push permission prompt:

**7.1 The catch-up banner (~40 lines).** On load, compute the unfilled due days
from the snapshot with the `stats.ts` machinery that already exists, and if there
are any, show a dismissible banner on Today: *"3 jours non remplis : mer 2,
lun 31, dim 30"* with a tap-to-backfill link into each. Also write the IndexedDB
reminder record here (§5.1) so that everything later is additive.

**7.2 An `.ics` the user installs once (~20 lines).** A Settings button that
generates a `text/calendar` blob with two `RRULE:FREQ=DAILY` VEVENTs at the
configured times, each with a `URL:` pointing at the app, and hands it to the
platform's calendar. Works on iOS, Android and desktop, needs no permission, and
survives the app never being opened.

**How much worse is this, honestly?**

| | Zero-infra fallback | Push tick |
| --- | --- | --- |
| Fires at 21:30 / 07:20 without the app open | Yes (calendar) | Yes |
| **Conditional — silent on filled days** | **No.** The calendar fires all 365 evenings, including the ~330 you already filled. | Yes |
| Says "3 days unfilled" | Only after you open the app | In the notification itself |
| Works on iOS | Yes | Only as an installed PWA |
| Infrastructure | None | One GCP project |
| Privacy | Perfect | Server learns a pseudonymous endpoint + two times/day |

The gap is **exactly one thing: conditionality**, i.e. driver D4. That is not a
small thing — an unconditional daily nag on a day you already logged is how a
habit tracker earns deletion, which is the roadmap's own stated objection. But it
is one thing, and it is worth knowing that the fallback delivers the *timing*
requirement completely and fails only the *"only if"* clause.

There is a middle rung, on Android only: **Periodic Background Sync** (§4.3) is
conditional *and* zero-infrastructure. It just cannot promise a time.

---

## 8. Decision

**Adopt the content-free tick with a local decision — and reach it in phases,
shipping the zero-infrastructure pieces first.** Specifically:

1. **The server never decides whether to remind.** It sends an empty push at a
   time. Full stop. Any future feature that requires the server to know whether a
   day is filled needs a new ADR that explicitly revokes the privacy property.
2. **The service worker decides**, from an IndexedDB record written by the page.
   No token, no network, no spreadsheet access in the background.
3. **One push per day (evening), carrying the whole message** — including the
   count of unfilled days. The separate morning push is optional, off by default,
   and gated on verifying Chrome's silent-push tolerance (§5.5).
4. **Manual subscription registration.** No public endpoint until there is a
   second user.

Rejected, with reasons: Notification Triggers (never shipped, §4.2); a
server-side check (violates D1); a Telegram/Signal bot (moves the decision
server-side); `setTimeout` in a page (§4.4); a native shell (roadmap, and not
needed unless push proves unreliable); Periodic Background Sync *as the only
mechanism* (no iOS, no Firefox, no guaranteed time).

## 9. Phased plan

| Phase | What ships | Infra | Effort | What it buys |
| --- | --- | --- | --- | --- |
| **0** | Catch-up banner + backfill links; IndexedDB reminder record; `localRepository` moved to IndexedDB | None | ~1 evening | Nothing is ever silently lost once the app is opened. Foundation for every later phase. |
| **1** | `.ics` generator (two daily events, deep links) + a Settings note about setting an OS alarm | None | ~2 hours | The *timing* requirement, on every platform including iOS. Unconditional. |
| **2** | Periodic Background Sync + the SW notification path (`showNotification` from the record) | None | ~half a day | The *conditional* requirement on Android/Chrome installed PWAs, with imprecise timing. Also builds and debugs the entire notification-content path with no server involved. |
| **3** | VAPID keypair, `pushManager.subscribe`, Settings shows the subscription JSON + last-tick timestamp | None yet | ~half a day | Everything client-side is ready; nothing is running. |
| **4** | Cloud Scheduler + Cloud Run job + Secret Manager, per §6.3 | ~8 Terraform resources | ~1 day | Precise 21:30 conditional reminders, and the only mechanism that works on iOS. |
| **5** | *Only if wanted:* separate morning channel; Firestore + a `POST /subscribe` endpoint if a second user appears | + Firestore, + a service | | |

Phase 2 is deliberately before phase 3: it exercises the SW notification path,
the IndexedDB read, the French copy and the "how many days are unfilled" logic
**without any infrastructure**, so that when the tick arrives, the only new thing
being debugged is delivery.

## 10. What will simply not work on iOS

Plainly, because this is where the plan is weakest:

- **Periodic Background Sync does not exist in WebKit** (BCD: `false`,
  never implemented). Phase 2 delivers nothing on iPhone. If the owner's phone is
  an iPhone, phase 2 is a desktop/Android-only feature and **phase 4 is not
  optional** — it is the only conditional reminder available.
- **Notification Triggers does not exist anywhere**, iOS included.
- **Web Push requires the PWA to be installed to the Home Screen** (iOS 16.4+).
  A Safari tab cannot subscribe — `Notification` is literally `undefined` there.
  Uninstalling drops the subscription silently. **Declarative Web Push** (iOS
  18.4) did not change this, and is in any case useless to this design: it has
  the browser render a server-supplied JSON payload without waking the service
  worker, which is the exact opposite of "the device decides".
- **The manifest's `display` must stay non-default.** iOS requires it for
  notifications in an installed web app. It is currently `"standalone"`; a
  well-meaning change to the default would break reminders on iPhone with no
  error anywhere.
- **`showNotification` options `actions`, `requireInteraction`, `badge`, `data`,
  `image`, `renotify` are unsupported on Safari and Safari iOS** (BCD). No
  "Remplir maintenant" button, no sticky notification; the body text and a tap
  must carry everything.
- **Delivery timing is Apple's**, and iOS is aggressive about background work.
  Expect occasional lateness. There is no API-level remedy.
- **No way to reach a non-installing iOS user at all.** For them the honest
  answer is the calendar event from phase 1, and it is unconditional.

If iOS reliability turns out to be unacceptable after phase 4, the remaining
option is the thin native shell (§4.5) — local scheduled notifications, decided
on-device, no server, perfect privacy — at the cost of a build pipeline and
reopening the roadmap's "no native app" decision. Name it now so it is not
discovered as a surprise later.

## 11. Verification status

**Verified directly, 2026-09-05** (MDN browser-compat-data, read as JSON rather
than via a summary page):

- `api.PushManager`: Chrome 42, Firefox 44, Safari 16, **Safari iOS 16.4**,
  Edge 17.
- `api.PeriodicSyncManager` and
  `api.ServiceWorkerRegistration.periodicSync`: Chrome/Edge 80, **Firefox
  `false`, Safari and Safari iOS `false`**.
- `api.ServiceWorkerRegistration.showNotification` option support: `actions`,
  `badge`, `data`, `image`, `renotify`, `requireInteraction`, `vibrate` all
  **`false` on Safari and Safari iOS**; several also false on Firefox.
- **No `showTrigger` option and no `TimestampTrigger` interface exist anywhere in
  BCD**, in a dataset that individually tracks Chromium-only notification
  options. This is the evidence for §4.2.

**Verified in this repository, 2026-09-05:**

- `src/lib/settings.ts` and `localRepository.ts` both use `localStorage`
  (`habits-tracker:settings`, `habits-tracker:local`) — hence invisible to
  `public/sw.js`.
- `src/lib/googleAuth.ts`: memory-only access token, no refresh token, scope
  `drive.file` — hence no background read of the spreadsheet is possible.
- `public/sw.js` has no `push`, `notificationclick` or `periodicsync` handler
  today; `BYPASS_HOSTS` already keeps Google's origins out of the SW, which the
  reminder path must continue to respect.
- `src/core/stats.ts` already computes `DaySummary.complete` over the metrics
  actually due on each day — the exact input the reminder record needs.

**Also verified against primary sources, 2026-09-05:**

| Fact | Source |
| --- | --- |
| Notification Triggers: *"The development of Notification Triggers API… has ended"*, listed under "No longer pursuing" | [developer.chrome.com](https://developer.chrome.com/docs/web-platform/notification-triggers) |
| Chrome Platform Status 5133150283890688: "In developer trial (Behind a flag)", no ship milestone, Firefox/Safari "No signal", entry last touched 2022-09-13 | `chromestatus.com/api/v0/features/5133150283890688` |
| `WICG/notification-triggers` 404; explainer at `beverloo/notification-triggers`, no push since 2019-09-06 | GitHub API |
| iOS 16.4 Web Push, Home Screen web apps only, user gesture required | [WebKit 2023-02-16](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/) |
| iOS still Home-Screen-only; `Notification` is `undefined` otherwise; manifest needs a non-default `display` | MDN BCD `api/Notification.json`, `api/PushManager.json` |
| Declarative Web Push (iOS/iPadOS 18.4, macOS 15.5) did not lift the Home Screen requirement | [WebKit 2025-03-27](https://webkit.org/blog/16535/meet-declarative-web-push/) |
| Safari 26.6 release notes mention push/notifications/web apps not at all | [WebKit](https://webkit.org/blog/18178/webkit-features-for-safari-26-6/) |
| Desktop Safari 16 push works in a plain tab, delivered by `webpushd` | [WebKit 2022-06-07](https://webkit.org/blog/12945/meet-web-push/) |
| EU DMA alternative browser engines: iOS 17.4+ / iPadOS 18+, entitlement, EU-only | [Apple](https://developer.apple.com/support/alternative-browser-engines/) |
| Periodic Background Sync 12 h floor is **in the spec** (`43200000` ms) | [WICG spec](https://wicg.github.io/periodic-background-sync/index.html) |
| Periodic sync: installed-PWA-only, site-engagement-gated, no developer control of timing | [developer.chrome.com](https://developer.chrome.com/docs/capabilities/periodic-background-sync) (updated 2025-08-19) |
| Firefox standards position on Periodic Background Sync: negative | [mozilla/standards-positions#214](https://github.com/mozilla/standards-positions/issues/214) |
| `TTL` header mandatory (400 without it); `Urgency` optional | [RFC 8030](https://www.rfc-editor.org/rfc/rfc8030.html) |
| VAPID; a subscription may be restricted to one server's public key | [RFC 8292](https://www.rfc-editor.org/rfc/rfc8292.html) |
| `userVisibleOnly: true` required by Chrome/Edge | [MDN](https://developer.mozilla.org/en-US/docs/Web/API/PushManager/subscribe) |
| *"blanket silent push will not be implemented in Chrome"*; budget API explored | [web.dev](https://web.dev/articles/push-notifications-subscribing-a-user) |
| Push API spec enforcement is MAY/SHOULD, not MUST | [W3C Push API](https://www.w3.org/TR/push-api/) |
| Cloud Scheduler: 3 jobs/month free **per billing account**, $0.10/job/31 days beyond | [pricing](https://cloud.google.com/scheduler/pricing) |
| Cloud Run **jobs**: 240 000 vCPU-s + 450 000 GiB-s free/month, aggregated per billing account | [pricing](https://cloud.google.com/run/pricing) |
| Cloud Functions 2nd gen now bills as Cloud Run | [pricing](https://cloud.google.com/functions/pricing) |
| Secret Manager: 6 active versions and 10 000 access ops free/month; then $0.06/version-month, $0.03/10 000 ops | [pricing](https://cloud.google.com/secret-manager/pricing) |
| Firestore: 50 k reads / 20 k writes / 20 k deletes per **day**, 1 GiB, one free database per project | [pricing](https://cloud.google.com/firestore/pricing) |
| GitHub Actions `schedule`: delayable, *"some queued jobs may be dropped"*, 5-minute minimum, disabled after 60 days of inactivity in public repos | [docs](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows) |

**Still unverified — do not quote as fact:**

1. **How many silent pushes Chrome actually tolerates**, and the exact wording of
   the fallback notification (widely reported as "This site has been updated in
   the background", but found only in secondary sources — no primary Google page).
   Chrome's *intent* is verified (§5.5); the *number* is not. This is why the
   recommended design in §5.5 variant 1 keeps silent pushes to ~35/year rather
   than betting on a budget.
2. **RFC 8030 does not contain a verbatim clause naming an empty/"tickle"
   message.** A payload is not made mandatory, and payload-less pushes are
   standard practice, but the "content-free tick" is an *inference from the
   absence of a requirement*, not a quoted guarantee. Test it against the real
   push services early — it is the linchpin of the design.
3. **All GCP prices are the pricing pages' default region (us-central1).** The
   per-region tables are JavaScript-rendered and `europe-west1` could not be
   read. The conclusion ("≈$0.02/month at either scale") survives any plausible
   regional multiplier; the individual figures are not European.
4. Whether any iOS release after 16.4 enables Web Push for **non-installed**
   sites — none was found, and the widely repeated "iOS 26 opens Home Screen
   sites as web apps by default" claim appears only in third-party blogs with no
   Apple or WebKit source.
5. Whether any non-WebKit engine has actually shipped on iOS in the EU, and
   whether such an engine could deliver push to a non-installed site.
6. The legacy Cloud Functions **1st gen** free tier (2 M invocations /
   400 k GB-s) — not fetched; irrelevant if the design uses Cloud Run.
7. WebKit's standards position on *Periodic* Background Sync specifically (only
   the general Background Sync issue was found). BCD's `false` is the load-bearing
   fact.
