import type { Entry, Goal, ISODate, Metric, Note, Snapshot, TrackedEvent } from './types'
import { parseValue } from './values'

/**
 * The seam the whole app is built around.
 *
 * The UI never talks to Google. It asks a `HabitRepository` for a snapshot and
 * hands it back changes. Swapping the Google Sheet for a real REST API later is
 * a matter of writing one more implementation of this interface — no screen,
 * no component and nothing in `core/` needs to change.
 */
export interface HabitRepository {
  /** Identifies the backend in the UI ("Google Sheets", "Cet appareil"). */
  readonly kind: RepositoryKind
  readonly label: string

  /** One round-trip, because remote backends bill per request. */
  load(): Promise<Snapshot>

  /**
   * Replace *every* stored answer for `date` with `entries`.
   *
   * Replacement rather than upsert, because clearing an answer has to delete its
   * row: the caller always sends the complete day, and a metric absent from
   * `entries` means "no longer answered", not "leave it alone".
   */
  saveDay(date: ISODate, entries: Entry[]): Promise<void>

  saveNote(note: Note): Promise<void>
  deleteNote(id: string): Promise<void>

  saveEvent(event: TrackedEvent): Promise<void>
  deleteEvent(id: string): Promise<void>

  /** Promote a recurring note into a first-class tracked metric. */
  addMetric(metric: Metric): Promise<void>

  /**
   * Upsert a goal by id.
   *
   * Raising or lowering a target is *not* an update of the existing row: the
   * caller closes the current goal with a `to` date and saves a new one, so the
   * history of what the bar used to be survives.
   */
  saveGoal(goal: Goal): Promise<void>
  deleteGoal(id: string): Promise<void>
}

export type RepositoryKind = 'local' | 'sheets'

/**
 * Backends read cells as strings. This applies the per-metric typing once the
 * config is known, drops entries whose metric no longer exists, and — the part
 * that matters — reduces the raw rows to the *effective* answer per day.
 *
 * A remote backend records a correction by appending a new row rather than by
 * rewriting the old one, because rewriting means re-uploading the whole tab on
 * every keystroke. So the same `(date, metricId)` can legitimately appear
 * several times, and the last occurrence is the truth. An appended row with an
 * empty value is a *tombstone*: the answer was cleared.
 *
 * Collapsing here, once, is deliberate. The alternative is that every consumer
 * deduplicates — `bucketSeries`, the goals engine, and every aggregation not
 * written yet — and sooner or later one of them forgets and quietly
 * double-counts a corrected day.
 */
export function typeEntries(raw: Entry[], metrics: Metric[]): Entry[] {
  const byId = new Map(metrics.map((m) => [m.id, m]))
  const effective = new Map<string, Entry>()

  for (const e of raw) {
    const metric = byId.get(e.metricId)
    if (!metric) continue
    // `Map.set` on an existing key keeps its original position, so the natural
    // chronological order of the sheet survives while the value is updated.
    effective.set(`${e.date}\u0000${e.metricId}`, {
      ...e,
      value: parseValue(metric, String(e.value ?? '')),
    })
  }

  return [...effective.values()].filter((e) => e.value !== null && e.value !== '')
}

/** Index a snapshot's entries as `date -> metricId -> value`, for O(1) lookups. */
export function indexEntries(entries: Entry[]): Map<ISODate, Map<string, Entry>> {
  const byDate = new Map<ISODate, Map<string, Entry>>()
  for (const e of entries) {
    let day = byDate.get(e.date)
    if (!day) byDate.set(e.date, (day = new Map()))
    // Later rows win: an append-only backend keeps the newest correction last.
    day.set(e.metricId, e)
  }
  return byDate
}

export function answersFor(entries: Entry[], date: ISODate): Map<string, Entry['value']> {
  const answers = new Map<string, Entry['value']>()
  for (const e of entries) if (e.date === date) answers.set(e.metricId, e.value)
  return answers
}
