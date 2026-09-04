/**
 * Domain model of the tracker.
 *
 * Nothing in this folder knows about Google Sheets, React, or the browser.
 * Storage backends implement `HabitRepository` (see ./repository.ts) and are
 * the only place allowed to know where the data physically lives.
 */

/** A calendar day in `YYYY-MM-DD`, always interpreted in the user's local time. */
export type ISODate = string

export type MetricType =
  /** Yes / no. */
  | 'bool'
  /** Ordered levels, e.g. Faible | Moyen | Fort. Comparable and chartable. */
  | 'scale'
  /** Unordered labels, e.g. a presumed cause. Categorical, not comparable. */
  | 'choice'
  /** A quantity, optionally bounded and with a unit. */
  | 'number'
  /** Free text attached to a specific metric. */
  | 'text'

/** When a metric is proposed in the daily form. */
export interface Schedule {
  /** Weekday numbers (0 = Sunday … 6 = Saturday) on which the metric is due. */
  days: number[]
  /** The original spreadsheet cell, kept verbatim so writes round-trip cleanly. */
  raw: string
}

/**
 * Where a metric shows up.
 * - `daily` — part of the evening routine.
 * - `quick`  — rare, out-of-flow: reachable via a quick-add button, never asked.
 * - `both`   — asked daily *and* quick-addable.
 */
export type MetricMode = 'daily' | 'quick' | 'both'

/** One thing being tracked. Defined entirely in the spreadsheet, never in code. */
export interface Metric {
  id: string
  label: string
  type: MetricType
  /** Ordered levels for `scale`, allowed labels for `choice`. Empty otherwise. */
  options: string[]
  min?: number
  max?: number
  unit?: string
  /** Tag ids this metric belongs to. A metric can carry several (vélo = sport + travail). */
  tags: string[]
  /** Section heading in the form, e.g. "Santé". */
  group: string
  schedule: Schedule
  mode: MetricMode
  /**
   * Id of another metric. This one is only asked when the parent's answer for
   * the same day is truthy — this is how "urticaire → intensité → cause" works
   * without hard-coding a single composite field type.
   */
  dependsOn?: string
  order: number
  /** Optional override; falls back to the colour of the first tag. */
  color?: string
  help?: string
  active: boolean
}

export interface Tag {
  id: string
  label: string
  color: string
}

/** `null` means "not answered". `false` means "answered no" — they are different. */
export type MetricValue = boolean | number | string | null

export interface Entry {
  date: ISODate
  metricId: string
  value: MetricValue
  updatedAt: string
}

/** A free-form journal line, categorised by tags rather than by metric. */
export interface Note {
  id: string
  date: ISODate
  tags: string[]
  text: string
  createdAt: string
}

/** A milestone or a period ("rush release", "vacances"). `end` may equal `start`. */
export interface TrackedEvent {
  id: string
  label: string
  start: ISODate
  end: ISODate
  tags: string[]
  note: string
}

export interface TrackerConfig {
  metrics: Metric[]
  tags: Tag[]
}

/** Everything a backend hands over in one read. */
export interface Snapshot {
  config: TrackerConfig
  entries: Entry[]
  notes: Note[]
  events: TrackedEvent[]
}

export interface DateRange {
  from: ISODate
  to: ISODate
}
