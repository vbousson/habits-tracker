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
 * - `quick` — rare, out-of-flow: reachable via a quick-add button, never asked.
 * - `both`  — asked daily *and* quick-addable.
 * - `auto`  — never asked at all; the app writes it. Used for measurements about
 *             the act of tracking itself, such as how long a day took to fill in.
 *             It still flows through the statistics like any other metric.
 */
export type MetricMode = 'daily' | 'quick' | 'both' | 'auto'

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
  /**
   * One colour per entry in `options`, so a graded answer can read at a glance
   * — red through green for a mood, for instance. Empty means "derive it", and a
   * shorter list than `options` is padded by derivation rather than rejected.
   */
  colors: string[]
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

/** How a goal turns a period's worth of answers into one number. */
export type GoalAggregate =
  /** Days in the period on which any of `metrics` was answered positively. */
  | 'count'
  /** Sum of the numeric answers. */
  | 'sum'
  /** Mean of the numeric answers. */
  | 'average'
  /** Positive days divided by eligible days, as a percentage (0-100). */
  | 'rate'
  /** Longest run of consecutive positive days inside the period. */
  | 'streak'

export type GoalComparator = '>=' | '<=' | '==' | '>' | '<'

export type GoalPeriod = 'day' | 'week' | 'month' | 'rolling'

/**
 * A target placed on one or more metrics over a period.
 *
 * This is what turns tracking into something with a verdict: recording that the
 * bike was used on three days is data, "at least twice a week" is a goal, and
 * only the second one can be met or missed.
 *
 * Goals span several metrics on purpose — "three sessions a week" can be
 * satisfied by cycling, by an evening workout or by a club session, and forcing
 * that into three separate targets would misrepresent the intent.
 *
 * `from` / `to` make goals a *history* rather than a setting. Raising a target
 * closes the current row and appends a new one, so a chart can still say that
 * two a week was the bar in September and three from January. Editing in place
 * would quietly rewrite the past and make every earlier verdict a lie.
 */
export interface Goal {
  id: string
  label: string
  /** Metric ids this goal is computed over; a day qualifies if any of them does. */
  metrics: string[]
  aggregate: GoalAggregate
  comparator: GoalComparator
  target: number
  period: GoalPeriod
  /** Window length in days when `period` is `rolling`. Defaults to 7. */
  windowDays?: number
  /**
   * Restricts the days a goal is judged on to those where this metric is truthy
   * — "bring lunch four times a week" only makes sense on days spent at work.
   */
  onlyWhen?: string
  /** First day the goal applies. */
  from: ISODate
  /** Last day it applies, inclusive. Absent means "still current". */
  to?: ISODate
  tags: string[]
  color?: string
  help?: string
  active: boolean
  order: number
}

export interface TrackerConfig {
  metrics: Metric[]
  tags: Tag[]
  goals: Goal[]
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
