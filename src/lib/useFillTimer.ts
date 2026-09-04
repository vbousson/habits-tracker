/**
 * How long a day took to fill in.
 *
 * Shortening the evening routine is itself one of the owner's goals, and a goal
 * cannot be improved without being measured — so the app measures itself and
 * writes the result into the `duree_saisie` metric like any other answer.
 *
 * What this number honestly is, and is not:
 *  - It measures **attention, not effort**: only wall-clock time with the tab
 *    visible and the screen mounted. Thinking about an answer while the phone is
 *    locked does not count, and neither does anything happening in another app.
 *  - It is **not comparable across devices**: a phone keyboard, a laptop and a
 *    cold PWA start are three different exercises. Compare a device to itself.
 *  - A single session is **capped** (the metric's own `max`, 900 s by default),
 *    so a tab left open overnight records fifteen minutes rather than four hours.
 *    That means an unusually long real session is recorded as the cap.
 *  - Nothing is recorded for a session in which no answer changed: opening the
 *    screen to look at yesterday is not filling anything in.
 *  - Sessions **add up**: coming back in the evening to finish a day extends the
 *    stored value instead of replacing it. The number is therefore "time spent
 *    on this day", not "time of the last visit".
 */
import { useEffect, useRef } from 'react'
import { serializeValue } from '../core/values'
import type { TrackerApi } from './useTracker'
import type { ISODate } from '../core/types'

/** The metric the timer writes to. A user who deletes the row switches it off. */
export const FILL_TIMER_METRIC = 'duree_saisie'

/** Fallback cap when the metric declares no `max`. */
const DEFAULT_CAP_SECONDS = 900

/**
 * Everything the user answered for `date`, except the timer's own value.
 *
 * Comparing this string before and after tells us whether the visit changed
 * anything. Excluding `duree_saisie` is what keeps the hook from mistaking its
 * own write for user activity and billing time for doing nothing.
 */
function fingerprint(tracker: TrackerApi, date: ISODate): string {
  return [...tracker.answersFor(date)]
    .filter(([id]) => id !== FILL_TIMER_METRIC)
    .map(([id, value]) => `${id}=${serializeValue(value)}`)
    .sort()
    .join('|')
}

/**
 * Accumulate visible time on `date` and persist it, once the user has actually
 * changed something. Inert while the config has no `duree_saisie` metric —
 * writing an entry for a metric that no longer exists would just be dropped by
 * `typeEntries` on the next load.
 */
export function useFillTimer(tracker: TrackerApi, date: ISODate): void {
  const trackerRef = useRef(tracker)
  // Never written during render: the flush handlers run long after the closure
  // that registered them, and must see the current api, not a stale one.
  useEffect(() => {
    trackerRef.current = tracker
  }, [tracker])

  const metric = tracker.snapshot?.config.metrics.find((m) => m.id === FILL_TIMER_METRIC)
  const enabled = metric !== undefined
  const cap = metric?.max !== undefined && metric.max > 0 ? metric.max : DEFAULT_CAP_SECONDS

  useEffect(() => {
    if (!enabled) return

    let visibleSince: number | null = document.visibilityState === 'visible' ? Date.now() : null
    let pendingMs = 0
    let recorded = 0
    /** The state of the day the last commit was measured against. */
    let baseline = fingerprint(trackerRef.current, date)

    const pause = () => {
      if (visibleSince === null) return
      pendingMs += Date.now() - visibleSince
      visibleSince = null
    }

    const commit = () => {
      pause()
      const seconds = Math.round(pendingMs / 1000)
      pendingMs = 0
      if (seconds < 1) return

      const api = trackerRef.current
      const now = fingerprint(api, date)
      // Looking is not filling in.
      if (now === baseline) return
      baseline = now

      const allowed = Math.max(0, Math.min(seconds, cap - recorded))
      if (allowed < 1) return
      recorded += allowed

      const previous = api.answersFor(date).get(FILL_TIMER_METRIC)
      const before = typeof previous === 'number' && Number.isFinite(previous) ? previous : 0
      api.setValue(date, FILL_TIMER_METRIC, before + allowed)
      // `setValue` only schedules a save. On the way out of the tab there may be
      // no "later", so push it now rather than lose the measurement.
      void api.flush()
    }

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        if (visibleSince === null) visibleSince = Date.now()
      } else {
        commit()
      }
    }

    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      commit()
    }
  }, [enabled, cap, date])
}
