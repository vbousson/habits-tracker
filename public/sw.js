/* global URL, clients */
/**
 * Service worker for habits-tracker.
 *
 * Hand-written on purpose: the app has exactly one HTML entry point and a
 * handful of hashed assets, so Workbox and its build plugin would be more
 * configuration than the problem deserves — and would add a dependency to a
 * project whose whole point is having almost none.
 *
 * Strategy:
 *   - navigations  -> network first, cache as backup. A deploy is picked up on
 *                     the next load instead of being pinned to a stale shell.
 *   - /assets/*    -> cache first. Vite fingerprints those filenames, so a
 *                     cached one can never be out of date.
 *   - other GETs   -> network first (icons, manifest), cache as backup.
 *   - Google       -> never touched. See BYPASS_HOSTS below.
 *
 * Bump CACHE_VERSION whenever the caching logic itself changes; the activate
 * handler then evicts everything the previous version stored.
 */

const CACHE_VERSION = 1
const CACHE_NAME = `habits-tracker-v${CACHE_VERSION}`

/** Where the app is mounted: "/" locally, "/habits-tracker/" on GitHub Pages. */
const BASE = new URL('./', self.registration.scope).pathname

/** The minimum needed to open the app with no network at all. */
const APP_SHELL = [
  BASE,
  `${BASE}manifest.webmanifest`,
  `${BASE}icons/icon-192.png`,
  `${BASE}icons/icon-512.png`,
  `${BASE}icons/apple-touch-icon.png`,
]

/**
 * Requests that must reach the network untouched, always.
 *
 * `googleapis.com` carries the Sheets reads and writes: serving a cached
 * snapshot would show the user stale data and, worse, a cached write response
 * would make a failed save look successful. `accounts.google.com` and
 * `gstatic.com` carry the Google Identity Services script and the token flow,
 * where an intercepted or replayed response breaks sign-in outright.
 */
const BYPASS_HOSTS = ['googleapis.com', 'accounts.google.com', 'gstatic.com', 'google.com']

function isBypassed(url) {
  return BYPASS_HOSTS.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`))
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      // One missing file must not abort the whole install, so each entry is
      // added independently and failures are tolerated.
      .then((cache) => Promise.allSettled(APP_SHELL.map((path) => cache.add(path))))
      // Single-page, single-user app: there is no other tab holding an
      // incompatible version hostage, so activating at once is safe and means
      // the user is never one refresh behind.
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
      )
      .then(() => clients.claim()),
  )
})

self.addEventListener('message', (event) => {
  // Lets the page trigger an update without a second reload.
  if (event.data === 'SKIP_WAITING') self.skipWaiting()
})

async function cacheFirst(request) {
  const cached = await caches.match(request)
  if (cached) return cached
  const response = await fetch(request)
  if (response && response.ok) {
    const cache = await caches.open(CACHE_NAME)
    await cache.put(request, response.clone())
  }
  return response
}

async function networkFirst(request, fallback) {
  try {
    const response = await fetch(request)
    if (response && response.ok && response.type === 'basic') {
      const cache = await caches.open(CACHE_NAME)
      await cache.put(request, response.clone())
    }
    return response
  } catch (error) {
    const cached = (await caches.match(request)) || (fallback && (await caches.match(fallback)))
    if (cached) return cached
    throw error
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return

  const url = new URL(request.url)

  // Never intercept Google. Doing so would either serve stale API data or
  // interfere with the OAuth token flow — both real bugs, not optimisations.
  if (isBypassed(url)) return

  // Anything else cross-origin (a CDN, an image someone pasted) is left alone.
  if (url.origin !== self.location.origin) return

  if (request.mode === 'navigate') {
    // GitHub Pages has no SPA rewrite, so the cached shell is what makes a
    // deep link work offline. `BASE` is the entry point in every deployment.
    event.respondWith(networkFirst(request, BASE))
    return
  }

  if (url.pathname.startsWith(`${BASE}assets/`)) {
    // Fingerprinted by Vite: the content behind this URL can never change.
    event.respondWith(cacheFirst(request))
    return
  }

  event.respondWith(networkFirst(request))
})
