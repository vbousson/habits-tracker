# Deployment

The app is a folder of static files. Anything that can serve a directory over
HTTPS can host it: GitHub Pages, Netlify, an S3 bucket, an nginx
you already run. There is no server component and nothing to configure at
runtime.

Two details decide whether it works or silently 404s, and both are covered below:
the **base path** and the **SPA fallback**.

- [GitHub Pages](#github-pages)
- [Custom domain](#custom-domain)
- [Any static host](#any-static-host)
- [Service worker registration](#service-worker-registration)
- [Troubleshooting](#troubleshooting)

---

## The two things that must be right

### 1. `BASE_PATH`

Vite writes asset URLs at build time. Built with the default base, `index.html`
asks for `/assets/index-a1b2c3.js` — an absolute path. Served from
`https://vbousson.github.io/habits-tracker/`, that resolves to
`https://vbousson.github.io/assets/index-a1b2c3.js`, which does not exist. You
get a blank page and a 404 in the console, with nothing in the UI to explain it.

[`vite.config.ts`](../vite.config.ts) reads `process.env.BASE_PATH` for exactly
this reason:

```ts
base: process.env.BASE_PATH ?? '/',
```

So:

| Where it is served from | `BASE_PATH` |
| --- | --- |
| `https://vbousson.github.io/habits-tracker/` | `/habits-tracker/` |
| `https://habits.example.com/` (custom domain, site root) | unset, or `/` |
| `https://example.com/tools/habits/` | `/tools/habits/` |
| `npm run dev` locally | unset |

Leading **and** trailing slash. Nothing else in the repository needs to change:
`index.html` uses Vite's `%BASE_URL%` placeholder, the manifest uses relative
paths, and the service worker derives its scope from its own registration.

### 2. `404.html`

The app is a single page. Static hosts have no rewrite rule sending unknown paths
back to `index.html`, so a refresh on any route other than the root returns the
host's 404 page.

The fix is one line, run after the build:

```sh
cp dist/index.html dist/404.html
```

GitHub Pages serves `404.html` for unmatched paths, which
makes it a serviceable SPA fallback. Both shipped pipelines already do this.

---

## GitHub Pages

[`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml) does the whole
job: build with the right `BASE_PATH`, copy the fallback, upload, deploy. It runs
on every push to `main` and can be triggered by hand from the Actions tab.

`BASE_PATH` is derived from `${{ github.event.repository.name }}`, so a fork
deploys to its own repository name with no edit.

### One-time setup

1. **Enable Pages with the Actions source.**
   Repository → **Settings** → **Pages** → **Build and deployment** →
   **Source: GitHub Actions**.
   This is the step everyone forgets. Leave it on "Deploy from a branch" and the
   workflow will run green and deploy nothing.
2. **Check Actions permissions.**
   **Settings** → **Actions** → **General** → **Workflow permissions**. The
   workflow declares the `pages: write` and `id-token: write` it needs, but the
   repository must be allowed to grant them.
3. **Add the Google client id** (optional — skip it for a demo-only deployment).
   **Settings** → **Secrets and variables** → **Actions** → **New repository
   secret**, named `VITE_GOOGLE_CLIENT_ID`, holding the OAuth client id from
   [GOOGLE_SETUP.md](GOOGLE_SETUP.md).
   Without it the build still succeeds; the app simply asks for a client id in
   its Settings screen, and the local demo backend works with no Google at all.
   The client id is **not** a secret — it is public by design, see
   [SECURITY.md](../SECURITY.md) — but a repository secret is the tidiest place
   to keep a per-deployment value.
4. **Push to `main`.** Watch the run in the Actions tab; the deploy job prints
   the URL.
5. **Authorise the origin in Google Cloud.** Add the resulting origin — e.g.
   `https://vbousson.github.io` (scheme and host only, no path) — to your OAuth
   client's **Authorized JavaScript origins**. Until you do, sign-in fails with
   `origin_mismatch`. Details in [GOOGLE_SETUP.md](GOOGLE_SETUP.md).

### Custom domain

Serving from the root of your own domain simplifies things: the base path
becomes `/`.

1. Add a `CNAME` DNS record pointing at `<owner>.github.io`.
2. Repository → **Settings** → **Pages** → **Custom domain**, enter the domain,
   and tick **Enforce HTTPS** once the certificate is issued.
3. Change the build step in `deploy.yml` so the base path is the root:
   ```yaml
   env:
     BASE_PATH: /
     VITE_GOOGLE_CLIENT_ID: ${{ secrets.VITE_GOOGLE_CLIENT_ID }}
   ```
4. GitHub's Pages settings normally recreate the `CNAME` file for you. If your
   deployments keep losing the domain, commit a `public/CNAME` file containing
   just the domain name so it is copied into `dist/` on every build.
5. Add the new origin to your OAuth client's **Authorized JavaScript origins**,
   and remove the old one if you no longer use it.
6. Update the Open Graph `og:url` and `og:image` in
   [`index.html`](../index.html), which are absolute by necessity — crawlers do
   not resolve relative URLs.

---

## Any static host

```sh
npm ci
BASE_PATH=/ npm run build       # or /sub/path/ if not at the root
cp dist/index.html dist/404.html
```

Upload `dist/` wherever you like. Requirements:

- **HTTPS.** Service workers and Google Identity Services both refuse to run over
  plain HTTP (`localhost` excepted).
- **A fallback to `index.html`** for unmatched paths — either the `404.html` copy
  above, or a real rewrite rule, which is better if your host supports one:

  ```nginx
  # nginx
  location / {
      try_files $uri $uri/ /index.html;
  }
  ```

  ```
  # Netlify — _redirects
  /*  /index.html  200
  ```

- **Correct caching headers**, if you can set them: `assets/*` is fingerprinted
  and can be `Cache-Control: public, max-age=31536000, immutable`, while
  `index.html`, `sw.js` and `manifest.webmanifest` must be `no-cache`. Serving a
  stale `sw.js` is the one way to make an update genuinely stick.

Everything runs in the browser. There is nothing to reverse-proxy, no environment
variable read at runtime, and no origin the app calls except Google's APIs when
the user has connected their account.

---

## Service worker registration

The worker itself lives at [`public/sw.js`](../public/sw.js) and is copied to the
site root by Vite. It is **not** registered automatically — that has to happen
from the app bootstrap. Add this to `src/main.tsx`:

```ts
// --- Service worker -------------------------------------------------------
// Registered only in production: in dev, a cached shell would serve a stale
// bundle over Vite's hot reload and cost you an hour before you noticed.
// `import.meta.env.BASE_URL` is what makes this correct under a project
// sub-path — a hard-coded '/sw.js' 404s on GitHub Pages.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`, {
        scope: import.meta.env.BASE_URL,
      })
      .catch((error: unknown) => {
        // Non-fatal: the app works online without it.
        console.warn('Service worker registration failed', error)
      })
  })
}
```

Three things about it are load-bearing:

- **`import.meta.env.BASE_URL`**, not `'/sw.js'`. Under
  `https://vbousson.github.io/habits-tracker/`, the absolute path 404s and you
  get no offline support and no install prompt, silently.
- **The explicit `scope`.** A worker's default scope is the directory it was
  served from, which is already right here, but stating it makes the intent
  obvious and survives someone moving the file.
- **`import.meta.env.PROD`.** Registering in development caches the dev shell and
  makes hot reload behave erratically.

To verify a deployment: open DevTools → **Application** → **Service Workers**.
You should see one activated worker whose scope matches the site's base path, and
a cache named `habits-tracker-v1` under **Cache Storage**.

---

## Troubleshooting

### Blank page, 404s on `/assets/…` in the console

Wrong `BASE_PATH`. The bundle was built for a different path than the one it is
served from. Check the `href`/`src` attributes in the deployed `index.html`: they
must start with the sub-path you are actually serving from. Rebuild with the
right value and redeploy.

### 404 on refresh, but the app works if you navigate to it

Missing `404.html`. The host has no SPA fallback. Run
`cp dist/index.html dist/404.html` after the build, or configure a rewrite rule.

### Still seeing the old version after a deploy

The service worker. Navigations are network-first, so this should resolve itself
on the next load — but a browser can hold an old worker until every tab of the
app is closed.

- **As a user:** close all tabs of the app and reopen it. If it persists,
  DevTools → **Application** → **Service Workers** → **Unregister**, then reload.
- **As a maintainer:** if you changed the caching logic itself, bump
  `CACHE_VERSION` in [`public/sw.js`](../public/sw.js). The activate handler then
  drops every cache from the previous version.
- **On your host:** make sure `sw.js` and `index.html` are served with
  `Cache-Control: no-cache`. An HTTP cache holding an old `sw.js` defeats the
  worker's own update check.

### The workflow is green but the site is not there

Pages is still set to "Deploy from a branch". Repository → **Settings** →
**Pages** → **Source: GitHub Actions**.

### Sign-in fails with `origin_mismatch` or `idpiframe_initialization_failed`

The deployment's origin is not listed in the OAuth client's **Authorized
JavaScript origins**. Add the scheme and host only — `https://vbousson.github.io`,
not `https://vbousson.github.io/habits-tracker/`. Changes can take a few minutes
to propagate. See [GOOGLE_SETUP.md](GOOGLE_SETUP.md).

### The app asks for a client id even though the secret is set

Either the secret is named something other than `VITE_GOOGLE_CLIENT_ID`, or it
was added after the last build — Vite inlines `VITE_*` variables at build time,
so a new secret only takes effect on the next run. Re-run the deploy workflow.
Note that pasting a client id into the Settings screen always overrides the
built-in one; clearing that field falls back to the build-time value.

### "Install app" never offers itself

Needs HTTPS, a reachable `manifest.webmanifest`, at least a 192px and a 512px
icon, and an activated service worker. Check DevTools → **Application** →
**Manifest** for the list of what is missing. Under a sub-path, a manifest
referenced with an absolute `/manifest.webmanifest` is the usual culprit.

### Nothing loads offline

The worker caches the app shell on install, so the *first* visit must succeed
online. Check that a `habits-tracker-v*` cache exists under **Cache Storage**.
Note that the Google Sheets backend genuinely cannot work offline — the app falls
back to showing an error. The local demo backend works offline entirely.
