/**
 * Every reminder decision, as pure functions.
 *
 * Nothing here reads the clock, the network or the environment: the instant, the
 * stored state and the window width all arrive as arguments. That is deliberate
 * — `tests/push.test.ts` imports this file directly, and a decision buried in an
 * HTTP handler is a decision nobody tests. `index.js` is only wiring.
 *
 * Typed for the app's `tsc` through the hand-written `decide.d.ts` next door.
 */

/** `HH:MM` -> minutes since midnight, or `null` when the string is not a time. */
export function parseHhMm(value) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value ?? '').trim())
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours > 23 || minutes > 59) return null
  return hours * 60 + minutes
}

const formatters = new Map()

function formatterFor(timeZone) {
  let formatter = formatters.get(timeZone)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
    formatters.set(timeZone, formatter)
  }
  return formatter
}

/**
 * The local calendar date and minute-of-day, in an IANA time zone.
 *
 * The `% 24` is not decoration: with `hour12: false` some ICU versions render
 * midnight as hour "24", which would put the first minute of the day at 1440 and
 * silently move every slot comparison out of range for one tick a day.
 */
export function zonedNow(instant, timeZone) {
  const parts = {}
  for (const part of formatterFor(timeZone).formatToParts(instant)) parts[part.type] = part.value
  const hour = Number(parts.hour) % 24
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minute: hour * 60 + Number(parts.minute),
  }
}

const pad = (n) => String(n).padStart(2, '0')

/** Calendar arithmetic on a `YYYY-MM-DD` string, done in UTC so no zone shifts it. */
export function addDays(isoDate, delta) {
  const [year, month, day] = isoDate.split('-').map(Number)
  const shifted = new Date(Date.UTC(year, month - 1, day + delta))
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`
}

/** Evening first: at 21:30 it is the slot that has something to say. */
export const SLOTS = ['evening', 'morning']

function message(slot, pendingDays) {
  if (slot === 'evening') {
    if (pendingDays === 0) {
      return { title: 'Remplir la journée', body: "La journée qui se termine n'est pas remplie." }
    }
    const tail =
      pendingDays === 1 ? '1 journée précédente non plus' : `${pendingDays} journées précédentes non plus`
    return { title: 'Remplir la journée', body: `La journée n'est pas remplie, et ${tail}.` }
  }
  return pendingDays > 1
    ? { title: 'Rattrapage', body: `${pendingDays} journées en attente.` }
    : { title: 'Rattrapage', body: "Hier n'est pas rempli." }
}

/**
 * Which push, if any, this tick should send.
 *
 * A slot fires when the local minute falls in `[target, target + windowMinutes)`
 * — a half-open window, so two adjacent five-minute ticks can never both match — and
 * when a reminder is actually warranted:
 *
 *   - evening: the day that is ending is not filled  (`lastFilled < today`)
 *   - morning: yesterday is still not filled         (`lastFilled < yesterday`)
 *
 * `state.sent[slot]` is the second guard: a retried, late or duplicated tick
 * finds today's date already recorded and stays quiet. The window alone is not
 * enough, because Cloud Scheduler may fire late and land twice in one window.
 *
 * Returns `null` when there is nothing to send — which is most ticks.
 */
export function decide(state, now, windowMinutes = 5) {
  const timeZone = state?.tz || 'UTC'
  const { date: today, minute } = zonedNow(now, timeZone)
  const yesterday = addDays(today, -1)
  // An absent `lastFilled` means "never filled", which warrants both reminders.
  const lastFilled = typeof state?.lastFilled === 'string' ? state.lastFilled : ''
  const raw = Number(state?.pendingDays)
  const pendingDays = Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 0

  for (const slot of SLOTS) {
    const target = parseHhMm(state?.times?.[slot] ?? '')
    // An empty time is how the user disables one slot; see `settings.ts`.
    if (target === null) continue
    if (minute < target || minute >= target + windowMinutes) continue
    if (state?.sent?.[slot] === today) continue

    const warranted = slot === 'evening' ? lastFilled < today : lastFilled < yesterday
    if (!warranted) continue

    return { slot, date: today, payload: { slot, ...message(slot, pendingDays) } }
  }
  return null
}

/** The state to store once a push has actually left, so the next tick is quiet. */
export function markSent(state, slot, date) {
  return { ...state, sent: { ...state?.sent, [slot]: date } }
}

/**
 * RFC 8030: the push service answers 404 or 410 for an endpoint that no longer
 * exists — the PWA was uninstalled, the browser rotated the subscription, the
 * user revoked permission. Retrying it forever is the classic way to keep a dead
 * reminder alive in the logs and dead on the phone, so the subscription is
 * dropped instead and the Settings screen shows "non activées" again.
 */
export function isDeadSubscription(statusCode) {
  return statusCode === 404 || statusCode === 410
}
