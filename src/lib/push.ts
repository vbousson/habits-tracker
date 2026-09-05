/**
 * Push reminders, client side.
 *
 * The design and its trade-offs are in `docs/adr/0002-reminders.md`, including
 * the 2026-09 amendment that this module implements: the app tells the server
 * two derived facts — the most recent filled day, and how many past days are
 * still owed — and the server sends a push only when one is actually warranted.
 * No metric name, no value, no answer ever leaves the device.
 *
 * Everything degrades honestly. When the build carries no API URL, when the
 * browser has no Push API, when permission was refused, or when this is an
 * iPhone with the app still in a Safari tab, `getPushState` says so in French
 * and the Settings screen shows the `.ics` calendar fallback instead.
 */
import { addDays, todayISO } from '../core/date'
import { catchUpState } from '../core/catchup'
import type { Entry, ISODate, TrackerConfig } from '../core/types'
import type { Settings } from './settings'

/** Both are baked in at build time; see docs/PUSH_SETUP.md. */
const API_URL = (import.meta.env.VITE_PUSH_API_URL ?? '').trim().replace(/\/+$/, '')
const VAPID_PUBLIC_KEY = (import.meta.env.VITE_VAPID_PUBLIC_KEY ?? '').trim()

/** Long enough to swallow a burst of taps in the evening form. */
const SYNC_DEBOUNCE_MS = 3000

/** How far back a day still counts as "owed". Matches the catch-up banner. */
const LOOKBACK_DAYS = 14

// --- The two facts the server is told ---------------------------------------

export interface PushFacts {
  /** Most recent day, up to today, that is not owed an answer. */
  lastFilled: ISODate
  /** Unfilled days **strictly before** today. Today is `lastFilled`'s business. */
  pendingDays: number
}

/**
 * Derive the facts from the snapshot, reusing `catchUpState` rather than
 * recomputing "what is due" — that logic lives in `core/` and has tests.
 *
 * Today is excluded from `pendingDays` on purpose: at 07:20 the day has barely
 * started and counting it would turn "hier n'est pas rempli" into "2 journées en
 * attente", which is both wrong and the kind of small lie that gets a reminder
 * muted.
 */
export function pushFacts(
  config: TrackerConfig,
  entries: Entry[],
  today: ISODate = todayISO(),
  lookbackDays = LOOKBACK_DAYS,
): PushFacts {
  const { gaps } = catchUpState(config, entries, lookbackDays, today)
  const owed = new Set(gaps.map((gap) => gap.date))

  // Walk back from today to the first day that is not owed. Falling off the end
  // of the window means "nothing filled recently", which warrants both slots.
  let lastFilled = addDays(today, -lookbackDays)
  for (let back = 0; back < lookbackDays; back += 1) {
    const date = addDays(today, -back)
    if (!owed.has(date)) {
      lastFilled = date
      break
    }
  }

  return { lastFilled, pendingDays: gaps.filter((gap) => gap.date < today).length }
}

// --- Availability -----------------------------------------------------------

export type PushBlocker = 'not-configured' | 'apple-not-installed' | 'no-api' | 'denied'

export interface PushState {
  /** A live subscription exists in this browser. */
  subscribed: boolean
  /** `null` when push is usable here. */
  blocker: PushBlocker | null
  /** French explanation for the user, `null` when there is nothing to explain. */
  reason: string | null
}

const REASONS: Record<PushBlocker, string> = {
  'not-configured':
    "Les notifications ne sont pas configurées sur cette version de l'application : le service de rappel n'a pas été renseigné au moment de la compilation (voir docs/PUSH_SETUP.md).",
  'apple-not-installed':
    "Sur iPhone et iPad, les notifications web ne fonctionnent que si l'application est installée sur l'écran d'accueil. Ouvre le menu Partager de Safari, choisis « Sur l'écran d'accueil », puis rouvre l'application depuis l'icône et reviens ici.",
  'no-api': "Ce navigateur ne gère pas les notifications push. L'agenda ci-dessous reste disponible.",
  denied:
    'Les notifications sont bloquées pour ce site. Autorise-les dans les réglages du navigateur (ou du système, sur téléphone), puis réessaie.',
}

export function isPushSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
}

/** True on an Apple device that has *not* been added to the home screen. */
function isAppleNotInstalled(): boolean {
  if (typeof navigator === 'undefined' || typeof window === 'undefined') return false
  const ua = navigator.userAgent
  // iPadOS reports itself as a Macintosh; the touch-point count is what gives it
  // away, and a real Mac needs no home-screen install anyway.
  const apple = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
  if (!apple) return false
  const standalone =
    (navigator as Navigator & { standalone?: boolean }).standalone === true ||
    window.matchMedia?.('(display-mode: standalone)').matches === true
  return !standalone
}

function blocked(blocker: PushBlocker): PushState {
  return { subscribed: false, blocker, reason: REASONS[blocker] }
}

/**
 * What the Settings screen shows.
 *
 * Order matters: on an iPhone in a Safari tab `Notification` is literally
 * `undefined`, so the generic "no API" answer would be technically true and
 * completely useless. The install hint has to come first.
 */
export async function getPushState(): Promise<PushState> {
  if (!API_URL || !VAPID_PUBLIC_KEY) return blocked('not-configured')
  if (isAppleNotInstalled()) return blocked('apple-not-installed')
  if (!isPushSupported()) return blocked('no-api')
  if (Notification.permission === 'denied') return blocked('denied')

  const registration = await navigator.serviceWorker.getRegistration()
  const subscription = registration ? await registration.pushManager.getSubscription() : null
  return { subscribed: subscription !== null, blocker: null, reason: null }
}

// --- Key conversion ---------------------------------------------------------

/**
 * `applicationServerKey` wants raw bytes, and VAPID keys travel as base64url.
 *
 * Base64url swaps `+/` for `-_` and drops the padding, so both have to be put
 * back before `atob` will look at it.
 */
// `Uint8Array<ArrayBuffer>`, not the default `Uint8Array<ArrayBufferLike>`:
// `applicationServerKey` wants a `BufferSource`, which excludes a view over a
// `SharedArrayBuffer`. The narrower type is what the constructor already returns.
export function urlBase64ToUint8Array(base64Url: string): Uint8Array<ArrayBuffer> {
  const base64 = base64Url.trim().replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
  const raw = atob(padded)
  const bytes = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i)
  return bytes
}

// --- Talking to the service -------------------------------------------------

export type TokenSource = () => Promise<string>

interface StateBody {
  subscription?: unknown
  times: { evening: string; morning: string }
  tz: string
  lastFilled: ISODate
  pendingDays: number
}

function bodyOf(settings: Settings, facts: PushFacts): StateBody {
  return {
    times: { evening: settings.reminderEvening, morning: settings.reminderMorning },
    // The IANA name, not an offset: it is what keeps 21:30 at 21:30 across a
    // daylight-saving change without the app having to be opened.
    tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
    lastFilled: facts.lastFilled,
    pendingDays: facts.pendingDays,
  }
}

async function call(method: 'POST' | 'DELETE', getToken: TokenSource, body?: string): Promise<void> {
  const token = await getToken()
  const response = await fetch(`${API_URL}/state`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body } : {}),
  })
  if (response.ok) return
  if (response.status === 403) {
    throw new Error(
      "Le service de rappel a refusé ce compte Google. Vérifie que tu es connecté avec l'adresse autorisée et que l'identifiant client OAuth est bien celui du déploiement.",
    )
  }
  throw new Error(`Le service de rappel a répondu ${response.status}.`)
}

/**
 * Subscribe this browser and register it with the service.
 *
 * MUST be called from a click handler: `requestPermission` is gated on a user
 * gesture in every browser that matters, and silently resolves to `default`
 * otherwise.
 */
export async function enablePush(
  getToken: TokenSource,
  settings: Settings,
  facts: PushFacts,
): Promise<void> {
  const state = await getPushState()
  if (state.blocker) throw new Error(state.reason ?? 'Notifications indisponibles.')

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    throw new Error(
      "Notifications refusées. Rien n'est activé ; tu peux toujours utiliser le fichier d'agenda ci-dessous.",
    )
  }

  const registration = await navigator.serviceWorker.ready
  const existing = await registration.pushManager.getSubscription()
  const subscription =
    existing ??
    (await registration.pushManager.subscribe({
      // Required by Chrome and Edge, and the honest description of what this
      // does: every push it delivers shows a notification.
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    }))

  await call('POST', getToken, JSON.stringify({ subscription: subscription.toJSON(), ...bodyOf(settings, facts) }))
  lastBody = ''
}

/** Unsubscribe here, and tell the service to forget the endpoint. */
export async function disablePush(getToken: TokenSource): Promise<void> {
  const registration = await navigator.serviceWorker.getRegistration()
  const subscription = await registration?.pushManager.getSubscription()
  await subscription?.unsubscribe()
  await call('DELETE', getToken)
  lastBody = ''
}

// --- Keeping the server's view fresh ----------------------------------------

let timer: ReturnType<typeof setTimeout> | null = null
let lastBody = ''

/**
 * Push the current facts to the service, debounced and de-duplicated.
 *
 * Called on every snapshot change, which in the evening form means once per tap.
 * The debounce collapses the burst; the `lastBody` comparison then drops the
 * common case where the derived facts did not actually move — ticking a box on a
 * day that was already partly filled changes nothing the server cares about.
 *
 * Fire-and-forget on purpose: a failed sync means the server works from
 * yesterday's picture for a while, which at worst costs one redundant
 * notification. It must never surface an error over the form.
 */
export function syncPushState(getToken: TokenSource, settings: Settings, facts: PushFacts): void {
  if (!API_URL || !settings.pushEnabled) return

  const body = JSON.stringify(bodyOf(settings, facts))
  if (body === lastBody) return

  if (timer) clearTimeout(timer)
  timer = setTimeout(() => {
    timer = null
    lastBody = body
    void call('POST', getToken, body).catch(() => {
      // Forget it, so the next change retries instead of assuming it landed.
      lastBody = ''
    })
  }, SYNC_DEBOUNCE_MS)
}
