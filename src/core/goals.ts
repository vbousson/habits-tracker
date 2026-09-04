/**
 * The goals engine: the part that turns tracking into a verdict.
 *
 * `src/core/stats.ts` answers "what happened?". This file answers "was it good
 * enough?" — it folds a period's worth of answers into one number and compares
 * it to a target. Everything here is pure: no React, no DOM, no Google, and no
 * formatting decisions (the French wording lives in the UI layer).
 *
 * Three rules drive the whole file, and every one of them exists because the
 * naive version would quietly lie to the user:
 *
 *  1. A period is *clipped* to the goal's `from`/`to`. A goal created on a
 *     Friday must not be judged on the Monday before it, and reporting "1 / 2,
 *     manqué" for a two-day-old goal would be a false verdict.
 *  2. The future never counts against you. Days after today are not eligible,
 *     they are *remaining*.
 *  3. An upper bound is a budget, not a progress bar. "Grignoter au plus 2
 *     soirs" is at its best at zero, so `progress` and `consumed` are two
 *     different numbers and the UI is told which one to draw.
 */
import { addDays, eachDay, startOfMonth, startOfWeek, todayISO } from './date'
import { indexEntries } from './repository'
import { isDueOn } from './schedule'
import { isTruthy, normalize } from './values'
import type {
  DateRange, Entry, Goal, GoalComparator, ISODate, Metric, MetricValue, TrackerConfig,
} from './types'

/**
 * Which way the target points.
 *
 * `'=='` is filed under `at_least`: "exactement 7 jours" is a bar to reach, and
 * treating it as a budget would draw a full bar on an empty week.
 */
export type GoalDirection = 'at_least' | 'at_most'

/**
 * The single field a UI can switch on.
 *
 * - `met`        — the target is satisfied. For a lower bound this is reported
 *                  as soon as the value clears the bar, open period or not.
 * - `missed`     — the period is over and the target was not reached.
 * - `pending`    — the period is still open and the verdict is undecided. Also
 *                  used when there is simply nothing to judge (see `empty`).
 * - `at_risk`    — still reachable, but only by succeeding on *every* remaining
 *                  day (or, for a budget, by spending nothing more).
 * - `impossible` — a lower bound can no longer be reached even if every
 *                  remaining day is positive, or a budget is already overspent.
 */
export type GoalOutcome = 'met' | 'missed' | 'pending' | 'at_risk' | 'impossible'

export interface GoalResult {
  goal: Goal
  /** The goal's metrics that still exist in the config, in the goal's own order. */
  metrics: Metric[]
  /** Ids referenced by the goal (metrics or `onlyWhen`) that no longer exist. */
  missingMetrics: string[]

  /** The whole period containing the reference date, before clipping. */
  period: DateRange
  /** The part of that period the goal actually applies to — what was judged. */
  bounds: DateRange
  /**
   * `true` when `bounds` is shorter than `period` because of the goal's
   * `from`/`to`. A three-day first week must be presented as a three-day week.
   */
  partial: boolean
  /** `true` when the goal applies to no day at all in this period. */
  empty: boolean

  /** The aggregate's value. `rate` is a percentage 0-100, not a fraction. */
  value: number
  target: number
  met: boolean
  direction: GoalDirection

  /**
   * 0..1, and **1 always means "currently satisfying the goal"**.
   * - lower bound: `min(1, value / target)`.
   * - upper bound: `1` while the budget holds, `0` once it is broken. The
   *   spending itself is `consumed`, never `progress`.
   */
  progress: number
  /**
   * Upper bounds only: the fraction of the allowance already spent, 0..1
   * (clamped, so an overrun reads as a full bar — the overrun itself shows in
   * `value` vs `target` and in `outcome: 'impossible'`). Always 0 for a lower
   * bound, where "consumed" means nothing.
   */
  consumed: number
  /**
   * How many more positive days a `count` lower bound still needs, floored at 0.
   * `null` whenever the notion does not apply (any upper bound, any other
   * aggregate) — a caller must not print "0 restants" from a `null`.
   */
  remaining: number | null

  /** Days in `bounds` that were judged (past, and passing `onlyWhen`/due). */
  eligibleDays: number
  /** Of those, the days at least one of the goal's metrics came out truthy. */
  positiveDays: number
  /**
   * Days in `bounds` still ahead of today that could count. `0` closes the
   * period. `onlyWhen` is deliberately *not* applied here: whether next
   * Thursday is a work day is not knowable from an answer that does not exist
   * yet, so a restricted goal counts its remaining days optimistically.
   */
  daysLeft: number
  outcome: GoalOutcome
}

/** Window length of a rolling goal. 7 days unless the sheet says otherwise. */
export function windowOf(goal: Goal): number {
  const w = goal.windowDays
  return w !== undefined && Number.isFinite(w) && w > 0 ? Math.floor(w) : 7
}

/**
 * The period containing `date`, before any clipping.
 *
 * Weeks are Monday→Sunday (`startOfWeek`), months are calendar months, and a
 * rolling window *ends* on `date` — `[date - (windowDays - 1), date]` — so it
 * always covers exactly `windowDays` days including today.
 */
export function goalPeriod(goal: Goal, date: ISODate): DateRange {
  switch (goal.period) {
    case 'day':
      return { from: date, to: date }
    case 'week': {
      const from = startOfWeek(date)
      return { from, to: addDays(from, 6) }
    }
    case 'month': {
      const from = startOfMonth(date)
      // +31 days always lands inside the next month, whatever this month's
      // length; back to its first day, then one day earlier is this month's last.
      return { from, to: addDays(startOfMonth(addDays(from, 31)), -1) }
    }
    case 'rolling': {
      const w = windowOf(goal)
      return { from: addDays(date, -(w - 1)), to: date }
    }
  }
}

/**
 * Intersect a period with the goal's validity. An empty `from` or `to` means
 * unbounded on that side. The result is empty (`from > to`) when the goal did
 * not apply to any day of the period.
 */
export function clipToValidity(goal: Goal, period: DateRange): DateRange {
  return {
    from: goal.from && goal.from > period.from ? goal.from : period.from,
    to: goal.to && goal.to < period.to ? goal.to : period.to,
  }
}

/** The goals in force on `date`: active, started, and not yet closed. */
export function activeGoalsOn(goals: readonly Goal[], date: ISODate = todayISO()): Goal[] {
  return goals
    .filter((g) => g.active && (!g.from || date >= g.from) && (!g.to || date <= g.to))
    .sort((a, b) => a.order - b.order || a.label.localeCompare(b.label))
}

export function compareGoal(value: number, comparator: GoalComparator, target: number): boolean {
  switch (comparator) {
    case '>=':
      return value >= target
    case '>':
      return value > target
    case '<=':
      return value <= target
    case '<':
      return value < target
    case '==':
      return value === target
  }
}

/** Everything the day loop needs, built once per public call. */
interface Context {
  byDate: Map<ISODate, Map<string, Entry>>
  metricsById: Map<string, Metric>
  today: ISODate
}

function contextOf(config: TrackerConfig, entries: Entry[], today: ISODate): Context {
  return {
    byDate: indexEntries(entries),
    metricsById: new Map(config.metrics.map((m) => [m.id, m])),
    today,
  }
}

/**
 * Numeric reading of an answer, for `sum`.
 * Only genuinely numeric answers contribute; summing booleans is what `count`
 * is for, and summing scale labels would be meaningless.
 */
function numericOf(metric: Metric, value: MetricValue): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (metric.type !== 'number' || typeof value !== 'string') return null
  const n = Number(value.replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

/**
 * Value used by `average` — the one place in this file where the semantics are
 * a judgement call, so it is spelled out.
 *
 * A `number` metric averages its **raw** values: a 45-minute session is 45, and
 * rescaling it would make "moyenne 0.6" out of a duration. `scale` and `bool`
 * have no unit of their own, so they average their normalised position **times
 * 100** — "Bon" on a three-level scale is 100, "Moyen" 50, "Faible" 0. That
 * makes a graded answer expressible as a percentage, and puts `average` on the
 * same 0-100 footing as `rate` so a target of 70 means the same thing in both.
 * `choice` and `text` have no order at all and are left out of the mean.
 */
function averageOf(metric: Metric, value: MetricValue): number | null {
  if (metric.type === 'number') return numericOf(metric, value)
  const n = normalize(metric, value)
  return n === null ? null : n * 100
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return n > 0 ? 1 : 0
  return Math.min(1, Math.max(0, n))
}

function evaluate(goal: Goal, ctx: Context, date: ISODate): GoalResult {
  const period = goalPeriod(goal, date)
  const bounds = clipToValidity(goal, period)
  const partial = bounds.from !== period.from || bounds.to !== period.to
  const empty = bounds.from > bounds.to

  // A goal whose metric was deleted from the sheet degrades to "nothing to
  // measure" instead of throwing, and says so through `missingMetrics`.
  const metrics: Metric[] = []
  const missingMetrics: string[] = []
  for (const id of goal.metrics) {
    const metric = ctx.metricsById.get(id)
    if (metric) metrics.push(metric)
    else missingMetrics.push(id)
  }
  const onlyWhen = goal.onlyWhen ? ctx.metricsById.get(goal.onlyWhen) : undefined
  // An unresolvable `onlyWhen` is ignored rather than treated as "never true":
  // silently emptying the goal would be far more misleading than judging it on
  // every day, and the missing id is reported so the UI can warn.
  if (goal.onlyWhen && !onlyWhen) missingMetrics.push(goal.onlyWhen)

  let eligibleDays = 0
  let positiveDays = 0
  let daysLeft = 0
  let sum = 0
  let averageSum = 0
  let averageCount = 0
  let run = 0
  let bestRun = 0

  for (const day of empty ? [] : eachDay(bounds)) {
    // For `rate` only, the denominator has to be days the question was actually
    // asked: a "70 % of nights" target computed over weekends when the metric is
    // weekdays-only measures the schedule, not the habit.
    const asked =
      goal.aggregate !== 'rate' ||
      metrics.some((m) => m.mode !== 'quick' && m.mode !== 'auto' && isDueOn(m.schedule, day))

    if (day > ctx.today) {
      if (asked) daysLeft += 1
      continue
    }
    if (!asked) continue

    const answers = ctx.byDate.get(day)
    if (onlyWhen && !isTruthy(onlyWhen, answers?.get(onlyWhen.id)?.value ?? null)) continue

    eligibleDays += 1
    let positive = false
    for (const metric of metrics) {
      const value = answers?.get(metric.id)?.value ?? null
      if (value === null || value === '') continue
      // Any one of the goal's metrics is enough: "bouger 3 fois" is satisfied by
      // a workout, a club session or a bike commute indifferently.
      if (isTruthy(metric, value)) positive = true
      const n = numericOf(metric, value)
      if (n !== null) sum += n
      const a = averageOf(metric, value)
      if (a !== null) {
        averageSum += a
        averageCount += 1
      }
    }
    if (positive) {
      positiveDays += 1
      run += 1
      bestRun = Math.max(bestRun, run)
    } else {
      // Only an *eligible* day breaks a run. Days excluded by `onlyWhen` are
      // skipped entirely, so a weekend does not ruin a commute streak.
      run = 0
    }
  }

  const value = (() => {
    switch (goal.aggregate) {
      case 'count':
        return positiveDays
      case 'sum':
        return sum
      case 'average':
        return averageCount === 0 ? 0 : averageSum / averageCount
      case 'rate':
        return eligibleDays === 0 ? 0 : (positiveDays / eligibleDays) * 100
      case 'streak':
        return bestRun
    }
  })()

  const { target, comparator } = goal
  const met = compareGoal(value, comparator, target)
  const direction: GoalDirection = comparator === '<=' || comparator === '<' ? 'at_most' : 'at_least'
  const closed = daysLeft === 0

  // Ratio to the bar. A target of 0 has no ratio, so the verdict itself decides.
  const ratio = target > 0 ? value / target : met ? 1 : 0
  const progress = direction === 'at_most' ? (met ? 1 : 0) : clamp01(ratio)
  const consumed =
    direction === 'at_most' ? clamp01(target > 0 ? value / target : value > 0 ? 1 : 0) : 0

  const remaining =
    goal.aggregate === 'count' && direction === 'at_least'
      ? Math.max(0, Math.ceil(target - value) + (comparator === '>' ? 1 : 0))
      : null

  /**
   * What the aggregate would come to if `misses` of the remaining days come out
   * negative and all the others positive. `null` for `sum` and `average`, which
   * have no ceiling per day and therefore can never be declared impossible.
   */
  const reachable = (misses: number): number | null => {
    const wins = Math.max(0, daysLeft - misses)
    switch (goal.aggregate) {
      case 'count':
        return positiveDays + wins
      case 'streak':
        return Math.max(bestRun, run + wins)
      case 'rate': {
        const denominator = eligibleDays + daysLeft
        return denominator === 0 ? 0 : ((positiveDays + wins) / denominator) * 100
      }
      default:
        return null
    }
  }
  const holds = (n: number | null): boolean => n !== null && compareGoal(n, comparator, target)

  const outcome: GoalOutcome = (() => {
    // Nothing was judged: the goal covers no day of this period, or every day of
    // it is still ahead. Either way a verdict would be invented, not computed.
    if (empty || eligibleDays === 0) return 'pending'
    // Once the period is closed the verdict is final. `at_risk` and `impossible`
    // only ever describe a period still running — a finished week that was blown
    // is simply "missed", which is what a history strip needs to read.
    if (closed) return met ? 'met' : 'missed'

    if (direction === 'at_most') {
      // A budget only ever goes up, so once it is broken it stays broken.
      if (!met) return 'impossible'
      const worst = reachable(0)
      if (worst === null) return 'pending'
      // Even spending every remaining day keeps it under the bar: already safe.
      if (compareGoal(worst, comparator, target)) return 'met'
      // One more positive day breaks it — the allowance is spent, not the period.
      return holds(reachable(daysLeft - 1)) ? 'pending' : 'at_risk'
    }

    if (met) return 'met'
    const best = reachable(0)
    if (best === null) return 'pending'
    if (!compareGoal(best, comparator, target)) return 'impossible'
    // Reachable, but losing a single remaining day would already sink it.
    return holds(reachable(1)) ? 'pending' : 'at_risk'
  })()

  return {
    goal,
    metrics,
    missingMetrics,
    period,
    bounds,
    partial,
    empty,
    value,
    target,
    met,
    direction,
    progress,
    consumed,
    remaining,
    eligibleDays,
    positiveDays,
    daysLeft,
    outcome,
  }
}

/**
 * Evaluate one goal over the period containing `date`.
 *
 * `today` exists so the caller can pin "now" — the UI passes the real day, the
 * tests pass a fixed one. It is what makes rule 2 (never judge the future)
 * testable at all.
 */
export function evaluateGoal(
  goal: Goal,
  config: TrackerConfig,
  entries: Entry[],
  date: ISODate = todayISO(),
  today: ISODate = todayISO(),
): GoalResult {
  return evaluate(goal, contextOf(config, entries, today), date)
}

/** Every goal in force on `date`, evaluated over its own period. */
export function evaluateGoals(
  config: TrackerConfig,
  entries: Entry[],
  date: ISODate = todayISO(),
  today: ISODate = todayISO(),
): GoalResult[] {
  const ctx = contextOf(config, entries, today)
  return activeGoalsOn(config.goals, date).map((goal) => evaluate(goal, ctx, date))
}

/**
 * One result per period across `range`, oldest first — the run of met/missed
 * weeks a resolution actually lives or dies by.
 *
 * Periods the goal never applied to are dropped, as are periods entirely in the
 * future: a strip of empty squares tells the user nothing. Rolling goals are
 * walked backwards from the end of the range in non-overlapping windows, so the
 * most recent square is always the window ending on `range.to`.
 */
export function goalHistory(
  goal: Goal,
  config: TrackerConfig,
  entries: Entry[],
  range: DateRange,
  today: ISODate = todayISO(),
): GoalResult[] {
  const ctx = contextOf(config, entries, today)
  return referenceDates(goal, range)
    .map((date) => evaluate(goal, ctx, date))
    .filter((r) => !r.empty && r.bounds.from <= today)
}

/** The dates to evaluate a goal on to tile `range` with its periods. */
function referenceDates(goal: Goal, range: DateRange): ISODate[] {
  if (range.from > range.to) return []
  switch (goal.period) {
    case 'day':
      return eachDay(range)
    case 'week': {
      const out: ISODate[] = []
      for (let d = startOfWeek(range.from); d <= range.to; d = addDays(d, 7)) out.push(d)
      return out
    }
    case 'month': {
      const out: ISODate[] = []
      for (let d = startOfMonth(range.from); d <= range.to; d = startOfMonth(addDays(d, 31))) out.push(d)
      return out
    }
    case 'rolling': {
      const w = windowOf(goal)
      const out: ISODate[] = []
      for (let d = range.to; d >= range.from; d = addDays(d, -w)) out.push(d)
      return out.reverse()
    }
  }
}

const VERSION_SUFFIX = /_v(\d+)$/

/**
 * `obj_velo` → `obj_velo_v2` → `obj_velo_v3`, skipping ids already taken.
 * Suffixing rather than reusing the id is what lets the old row survive: two
 * goals with the same id would collide in the `Goals` tab's upsert.
 */
export function nextGoalId(id: string, taken: readonly string[] = []): string {
  const used = new Set(taken)
  const base = id.replace(VERSION_SUFFIX, '')
  let n = Number(VERSION_SUFFIX.exec(id)?.[1] ?? 1) + 1
  while (used.has(`${base}_v${n}`)) n += 1
  return `${base}_v${n}`
}

/**
 * Raise or lower the bar without rewriting history.
 *
 * Returns `[closedPrevious, replacement]`: the old goal gains a `to` of the day
 * before `from`, and a new row with a fresh id carries the change from `from`
 * on. Save both. Editing the row in place instead would make every verdict ever
 * rendered for the old target retroactively wrong — September would suddenly
 * claim the bar had always been three a week.
 *
 * `changes` cannot touch `id`, `from` or `to`: those three are exactly what
 * makes the pair a history rather than an edit.
 */
export function supersede(
  goal: Goal,
  changes: Partial<Omit<Goal, 'id' | 'from' | 'to'>>,
  from: ISODate,
  existing: readonly Goal[] = [],
): [Goal, Goal] {
  const closedPrevious: Goal = { ...goal, to: addDays(from, -1) }
  const replacement: Goal = {
    ...goal,
    ...changes,
    id: nextGoalId(goal.id, [goal.id, ...existing.map((g) => g.id)]),
    from,
    to: undefined,
    active: true,
  }
  return [closedPrevious, replacement]
}
