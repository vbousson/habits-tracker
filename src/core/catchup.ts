/**
 * Which days are still owed an answer.
 *
 * This is the foundation of every reminder mechanism, and the reason it lives in
 * `core/` rather than in a notification module: the *decision* to remind must be
 * computable from the data alone, with no network and no server.
 *
 * That constraint is not incidental. A server that decided whether to remind
 * would have to know whether the day had been filled in, which would destroy the
 * one property this project actually guarantees — that nobody but the user can
 * see their data. See `docs/adr/0002-reminders.md`.
 */
import { summarizeDays } from './stats'
import { addDays, todayISO } from './date'
import type { DateRange, ISODate, Entry, TrackerConfig } from './types'

export interface DayGap {
  date: ISODate
  /** Metrics that were due and are still unanswered. */
  missing: number
  due: number
  /** Nothing at all was recorded, as opposed to a partially filled day. */
  untouched: boolean
}

/**
 * Days in `range` that were expected and are incomplete, oldest first.
 *
 * A day with nothing due — every metric scheduled elsewhere — is not a gap, so
 * a weekend never shows up because of weekday-only questions.
 */
export function findGaps(
  config: TrackerConfig,
  entries: Entry[],
  range: DateRange,
): DayGap[] {
  return summarizeDays(config, entries, range)
    .filter((day) => day.due > 0 && day.answered < day.due)
    .map((day) => ({
      date: day.date,
      missing: day.due - day.answered,
      due: day.due,
      untouched: day.answered === 0,
    }))
}

export interface CatchUpState {
  gaps: DayGap[]
  /** Yesterday specifically, because that is the one the morning reminder is for. */
  yesterdayPending: boolean
  todayPending: boolean
}

/**
 * The state a reminder — or the catch-up banner — needs.
 *
 * `today` is deliberately included: the evening reminder exists precisely to
 * catch the day that is ending. Callers that want only the past can drop it.
 */
export function catchUpState(
  config: TrackerConfig,
  entries: Entry[],
  lookbackDays = 14,
  today: ISODate = todayISO(),
): CatchUpState {
  const gaps = findGaps(config, entries, {
    from: addDays(today, -(lookbackDays - 1)),
    to: today,
  })
  const yesterday = addDays(today, -1)
  return {
    gaps,
    yesterdayPending: gaps.some((g) => g.date === yesterday),
    todayPending: gaps.some((g) => g.date === today),
  }
}

/**
 * The one-line French summary a notification or a banner shows.
 * Returns `null` when there is nothing to say — a reminder with no content is a
 * reminder that teaches the user to ignore reminders.
 */
export function describeGaps(gaps: DayGap[], today: ISODate = todayISO()): string | null {
  const past = gaps.filter((g) => g.date < today)
  if (past.length === 0) {
    return gaps.length > 0 ? "La journée d'aujourd'hui n'est pas encore remplie." : null
  }
  if (past.length === 1) return "Il reste la journée d'hier à remplir."
  return `${past.length} journées ne sont pas remplies.`
}
