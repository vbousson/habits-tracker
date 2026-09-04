# Security Policy

## Supported versions

This project is developed on `main` and released as a static site. Only the
latest release, and the deployment built from `main`, receive fixes.

| Version | Supported |
| ------- | --------- |
| `main` (latest deployment) | Yes |
| `0.1.x` | Yes |
| Anything older | No |

There is no long-term-support branch. If you run a fork, rebase it — there is
nothing for a backport to land on.

## Reporting a vulnerability

Please report privately. Do **not** open a public issue for a security problem.

Two channels, either is fine:

1. **GitHub private vulnerability reporting** — the preferred one:
   [open a draft advisory](https://github.com/vbousson/habits-tracker/security/advisories/new).
   It keeps the discussion, the fix and the eventual disclosure in one place.
2. **Direct message** — [@vbousson](https://github.com/vbousson) on GitHub, if
   the advisory flow is not available to you.

<!-- Maintainer: add a personal contact address here if you want one. A work
     address does not belong in a public personal repository. -->

Useful things to include: what an attacker gains, the steps to reproduce, the
affected version or commit, and the browser you saw it in. A proof of concept is
welcome; please keep it to data you own.

### What to expect

This is a personal project maintained in spare time, so these are honest targets
rather than a contractual SLA:

| Step | Target |
| ---- | ------ |
| Acknowledgement that the report was received | within 5 days |
| First assessment (accepted / not a vulnerability / need more information) | within 14 days |
| Fix for a confirmed issue | as fast as the severity warrants, and I will tell you what "as fast" means once I have assessed it |

If you have not heard back after two weeks, please ping the report — mail gets
lost. Reporters are credited in the advisory unless they ask not to be.

Please give a reasonable window before public disclosure. Since the app is a
static site with no server component, there is nothing to patch centrally: users
update by reloading, and forks update by rebuilding.

## What this project does and does not hold

Most security reports about a project like this one turn out to rest on a wrong
mental model of where the data is. Here is the accurate one.

### There is no server

The app is a static bundle of HTML, CSS and JavaScript. There is no backend, no
API of ours, no database, no session store, no log file. GitHub Pages serves
files; it never sees anything the user types.

### No user data ever reaches the maintainer

Everything a user records goes to exactly one of two places, both of which
belong to the user:

- **the browser**, in `localStorage`, in demo mode (`src/adapters/local/`);
- **the user's own Google Drive**, in a spreadsheet they own, when the Google
  Sheets backend is enabled (`src/adapters/sheets/`).

Requests to the Google Sheets API go from the user's browser directly to Google.
Nothing is proxied. The maintainer has no access to any user's spreadsheet, and
no way to obtain it.

There is no analytics, no telemetry, no error-reporting service, no third-party
script, no cookie set by the app, and no outbound request other than to Google's
own APIs when the user has explicitly connected their account.

### The OAuth client id is public by design — it is not a credential

**Please do not file a "leaked secret" report about `VITE_GOOGLE_CLIENT_ID`.**

The app uses the browser-side Google Identity Services token flow. That flow is
specified for public clients: the client id is embedded in the page and is
*meant* to be readable by anyone. It is an identifier, not a secret. Google's
own documentation ships it in client-side JavaScript.

Concretely:

- There is **no client secret** anywhere in this repository, in the built bundle,
  or in the deployment. A browser-side app has none, by construction.
- The client id alone grants nothing. Google will only issue a token for it to an
  origin listed in that Cloud project's *Authorized JavaScript origins*, and only
  after the user has personally clicked through the consent screen.
- Someone who copies the client id and points it at their own site gets an
  `origin_mismatch` error, not access to anybody's data.
- The build-time variable exists purely as a convenience so that the hosted
  deployment does not have to ask every visitor to paste one. It is also
  overridable at runtime in the app's Settings screen (`src/lib/settings.ts`),
  which is exactly what a fork or a self-hoster does.

### The access token lives in memory only

The OAuth access token obtained from Google Identity Services is held in a
JavaScript variable for the lifetime of the page (`src/lib/googleAuth.ts`). It is
**not** written to `localStorage`, `sessionStorage`, a cookie, or IndexedDB, and
there is no refresh token — a browser-side client cannot hold one safely. Closing
the tab discards it; the user re-consents on the next visit. This is a deliberate
trade of a little convenience for a token that cannot be stolen from disk by
another script or by anyone with the device later.

### The OAuth scope is deliberately narrow

The app requests `https://www.googleapis.com/auth/drive.file`, which grants
access **only to files the app itself created or that the user explicitly opened
with it** — not to the rest of the user's Drive. This is a non-sensitive scope,
which is also why the app can create the user's spreadsheet for them without ever
being able to read their unrelated documents.

### What *is* in scope for a report

Real vulnerabilities here look like:

- an XSS in the rendering of user-supplied content (metric labels, note text,
  event labels, `Config` cells — all of which come from a spreadsheet the user
  may have pasted into);
- the access token being persisted, logged, or leaked into a URL, a `Referer`
  header, or a third-party request;
- the service worker caching an authenticated Google API response
  (see `public/sw.js`, which explicitly bypasses Google — a regression there
  would be a genuine bug);
- a request made to any origin other than Google's APIs;
- a scope escalation, or the app touching a Drive file it did not create;
- a supply-chain problem in a dependency that reaches the shipped bundle;
- a way for one user's deployment to reach another user's data (there should be
  no mechanism by which this is even expressible).

Reports of "the client id is visible", "there is no rate limiting", "the site has
no CSRF token", or "`localStorage` is readable by the device owner" will be
closed with a pointer back to this section.
