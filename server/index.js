/* global process, console, fetch, URL, Buffer */
/**
 * The reminder service. Three routes, one user, no framework.
 *
 *   POST   /tick    Cloud Scheduler only, every 5 minutes. Decides and pushes.
 *   POST   /state   the owner's browser only. Stores the subscription and the
 *                   two facts the server needs to decide (see the amendment in
 *                   docs/adr/0002-reminders.md).
 *   DELETE /state   the owner's browser only. Forgets the subscription.
 *
 * Two things deliberately not here:
 *
 *   - No web framework. `node:http` routes three paths in twenty lines, and a
 *     framework is a supply chain to patch for the rest of the service's life.
 *   - No `@google-cloud/storage`. One JSON object, read and written through the
 *     storage JSON API with the token the metadata server already hands us, is
 *     forty lines and no dependency. `web-push` IS a dependency, on purpose:
 *     hand-rolling VAPID JWT signing and aes128gcm payload encryption is how you
 *     get a service that looks healthy and delivers nothing.
 *
 * The service is invokable by anyone at the network level, because `/state` is
 * called from a browser that has no Google-signed Cloud Run identity token. Both
 * routes therefore authenticate in the application, and `/tick` is not merely
 * "not documented" — it verifies the scheduler's OIDC token, issuer, audience
 * and service-account email before doing anything.
 */
import { createServer } from 'node:http'
import webpush from 'web-push'
import { decide, isDeadSubscription, markSent, parseHhMm } from './decide.js'

// --- Configuration ----------------------------------------------------------

function env(name, fallback) {
  const value = (process.env[name] ?? '').trim()
  if (value) return value
  if (fallback !== undefined) return fallback
  throw new Error(`Missing required environment variable: ${name}`)
}

const PORT = Number(env('PORT', '8080'))
const BUCKET = env('STATE_BUCKET')
const OBJECT = env('STATE_OBJECT', 'state.json')
const APP_ORIGIN = env('APP_ORIGIN')
const ALLOWED_EMAIL = env('ALLOWED_EMAIL').toLowerCase()
const OAUTH_CLIENT_ID = env('OAUTH_CLIENT_ID')
const SCHEDULER_SA_EMAIL = env('SCHEDULER_SA_EMAIL').toLowerCase()
const OIDC_AUDIENCE = env('OIDC_AUDIENCE')
const WINDOW_MINUTES = Number(env('WINDOW_MINUTES', '5'))

// Mounted as an environment variable by Cloud Run, not fetched per request:
// Secret Manager's free tier is 10 000 access operations a month and a */5 cron
// makes 8 640 ticks. Reading the secret per tick would double that and start
// billing for the privilege.
webpush.setVapidDetails(env('VAPID_SUBJECT'), env('VAPID_PUBLIC_KEY'), env('VAPID_PRIVATE_KEY'))

/** Short TTL on purpose: a 21:30 nag delivered at 06:00 is worse than nothing. */
const PUSH_TTL_SECONDS = 3 * 3600

// --- Cloud Storage, through the metadata-server token -----------------------

let serviceToken = null

async function serviceAccessToken() {
  if (serviceToken && serviceToken.expiresAt > Date.now() + 60_000) return serviceToken.value
  const response = await fetch(
    'http://metadata.google.internal/computeMetadata/v1/instance/service-account/default/token',
    { headers: { 'Metadata-Flavor': 'Google' } },
  )
  if (!response.ok) throw new Error(`metadata token: HTTP ${response.status}`)
  const body = await response.json()
  serviceToken = { value: body.access_token, expiresAt: Date.now() + Number(body.expires_in) * 1000 }
  return serviceToken.value
}

async function readState() {
  const url =
    `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(BUCKET)}` +
    `/o/${encodeURIComponent(OBJECT)}?alt=media`
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${await serviceAccessToken()}` },
  })
  // A bucket that has never been written to is the normal first-run state.
  if (response.status === 404) return {}
  if (!response.ok) throw new Error(`read state: HTTP ${response.status}`)
  return response.json()
}

async function writeState(state) {
  const url =
    `https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(BUCKET)}` +
    `/o?uploadType=media&name=${encodeURIComponent(OBJECT)}`
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${await serviceAccessToken()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ ...state, updatedAt: new Date().toISOString() }),
  })
  if (!response.ok) throw new Error(`write state: HTTP ${response.status}`)
}

// --- Authentication ---------------------------------------------------------

function bearer(request) {
  const header = request.headers.authorization ?? ''
  return header.startsWith('Bearer ') ? header.slice(7).trim() : ''
}

function isTrue(value) {
  return value === true || value === 'true'
}

const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com']

/**
 * The scheduler, and nothing else.
 *
 * Google's tokeninfo endpoint validates the signature, so no JWKS cache and no
 * crypto here. All three claims are checked: a token from the right issuer for
 * the wrong audience, or with the right audience and a different service
 * account, is refused.
 */
async function isScheduler(token) {
  if (!token) return false
  const response = await fetch(
    `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(token)}`,
  )
  if (!response.ok) return false
  const claims = await response.json()
  return (
    GOOGLE_ISSUERS.includes(claims.iss) &&
    claims.aud === OIDC_AUDIENCE &&
    isTrue(claims.email_verified) &&
    String(claims.email ?? '').toLowerCase() === SCHEDULER_SA_EMAIL
  )
}

/**
 * The owner, and nothing else.
 *
 * The audience check is the half that is easy to forget and expensive to skip:
 * with only the email compared, a Google access token minted for *any other
 * application* the owner has ever signed into could be replayed here to write
 * this service's state. `aud` pins the token to this app's OAuth client.
 */
const userTokens = new Map()
const USER_CACHE_MS = 60_000

async function isOwner(token) {
  if (!token) return false
  const cached = userTokens.get(token)
  if (cached && Date.now() - cached.at < USER_CACHE_MS) return cached.ok

  let ok = false
  const response = await fetch(
    `https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(token)}`,
  )
  if (response.ok) {
    const claims = await response.json()
    ok =
      claims.aud === OAUTH_CLIENT_ID &&
      isTrue(claims.email_verified) &&
      String(claims.email ?? '').toLowerCase() === ALLOWED_EMAIL
  }

  // A token lives an hour; the cache exists to spare a round-trip per keystroke
  // burst, not to be a session store. Trimming keeps a rotated token from
  // accumulating for the life of the instance.
  if (userTokens.size > 16) userTokens.clear()
  userTokens.set(token, { ok, at: Date.now() })
  return ok
}

// --- HTTP -------------------------------------------------------------------

const MAX_BODY_BYTES = 8 * 1024

function readBody(request) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    request.on('data', (chunk) => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        reject(new Error('body too large'))
        request.destroy()
        return
      }
      chunks.push(chunk)
    })
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    request.on('error', reject)
  })
}

function cors(response) {
  response.setHeader('Access-Control-Allow-Origin', APP_ORIGIN)
  response.setHeader('Access-Control-Allow-Methods', 'POST, DELETE, OPTIONS')
  response.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
  response.setHeader('Access-Control-Max-Age', '3600')
  response.setHeader('Vary', 'Origin')
}

function send(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  response.end(JSON.stringify(body ?? { ok: status < 400 }))
}

// --- Routes -----------------------------------------------------------------

/**
 * Merge, not replace: `syncPushState` in the browser posts only the freshness
 * facts, with no subscription, several times a day. Replacing the document would
 * silently unsubscribe the device on the first sync after enabling.
 */
function mergeState(current, patch) {
  const next = { ...current }
  if (patch.subscription?.endpoint) next.subscription = patch.subscription
  if (patch.tz) next.tz = String(patch.tz)
  if (typeof patch.lastFilled === 'string') next.lastFilled = patch.lastFilled
  if (Number.isFinite(Number(patch.pendingDays))) {
    next.pendingDays = Math.max(0, Math.floor(Number(patch.pendingDays)))
  }
  if (patch.times) {
    next.times = {
      evening: parseHhMm(patch.times.evening) === null ? '' : String(patch.times.evening).trim(),
      morning: parseHhMm(patch.times.morning) === null ? '' : String(patch.times.morning).trim(),
    }
  }
  return next
}

async function handleTick() {
  const state = await readState()
  if (!state.subscription) {
    console.log('tick: no subscription registered')
    return
  }

  const decision = decide(state, new Date(), WINDOW_MINUTES)
  if (!decision) {
    console.log('tick: nothing warranted')
    return
  }

  try {
    // Payload contents and the endpoint are never logged: the first is health
    // data, the second is a credential — knowing an endpoint is enough to push
    // to it.
    await webpush.sendNotification(state.subscription, JSON.stringify(decision.payload), {
      TTL: PUSH_TTL_SECONDS,
      urgency: 'high',
    })
    await writeState(markSent(state, decision.slot, decision.date))
    console.log(`tick: sent ${decision.slot} for ${decision.date}`)
  } catch (error) {
    if (!isDeadSubscription(error?.statusCode)) throw error
    const pruned = { ...state }
    delete pruned.subscription
    await writeState(pruned)
    console.log(`tick: subscription gone (HTTP ${error.statusCode}), dropped`)
  }
}

const server = createServer((request, response) => {
  void (async () => {
    const path = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`).pathname
    cors(response)

    try {
      if (request.method === 'OPTIONS') {
        response.writeHead(204)
        response.end()
        return
      }

      if (path === '/tick' && request.method === 'POST') {
        if (!(await isScheduler(bearer(request)))) {
          console.log('tick: rejected, not the scheduler')
          send(response, 403, { error: 'forbidden' })
          return
        }
        await handleTick()
        send(response, 200)
        return
      }

      if (path === '/state' && (request.method === 'POST' || request.method === 'DELETE')) {
        if (!(await isOwner(bearer(request)))) {
          console.log(`state: rejected, not the owner (${request.method})`)
          send(response, 403, { error: 'forbidden' })
          return
        }

        const current = await readState()

        if (request.method === 'DELETE') {
          const pruned = { ...current }
          delete pruned.subscription
          await writeState(pruned)
          console.log('state: subscription forgotten')
          send(response, 200)
          return
        }

        const patch = JSON.parse((await readBody(request)) || '{}')
        const next = mergeState(current, patch)
        await writeState(next)
        console.log(
          `state: updated (subscription=${next.subscription ? 'yes' : 'no'},` +
            ` pending=${next.pendingDays ?? 0})`,
        )
        send(response, 200)
        return
      }

      send(response, 404, { error: 'not found' })
    } catch (error) {
      console.error(`error on ${request.method} ${path}: ${error?.message ?? error}`)
      send(response, 500, { error: 'internal' })
    }
  })()
})

server.listen(PORT, () => console.log(`reminder service listening on ${PORT}`))
