/**
 * Aggregations behind the dashboard.
 *
 * Everything here is pure: given a config and a list of entries, produce numbers.
 * No colours, no DOM, no formatting decisions — those belong to the UI layer.
 */
import { addDays, eachDay, inRange, startOfMonth, startOfWeek } from './date'
import { isDueOn } from './schedule'
import { isTruthy, normalize } from './values'
import type { DateRange, Entry, ISODate, Metric, TrackerConfig } from './types'

/** Metrics that count towards a day's score: the ones actually asked that day. */
function dueMetrics(config: TrackerConfig, date: ISODate, tag?: string): Metric[] {
  return config.metrics.filter(
    (m) =>
      m.active &&
      m.mode !== 'quick' &&
      m.mode !== 'auto' &&
      !m.dependsOn &&
      isDueOn(m.schedule, date) &&
      (!tag || m.tags.includes(tag)),
  )
}

export interface DaySummary {
  date: ISODate
  /** Mean of the normalised answers, 0..1, or `null` when nothing was recorded. */
  score: number | null
  answered: number
  due: number
  /** True once every due metric has an answer — drives the "journée complète" badge. */
  complete: boolean
}

export function summarizeDays(
  config: TrackerConfig,
  entries: Entry[],
  range: DateRange,
  tag?: string,
): DaySummary[] {
  const byDate = new Map<ISODate, Map<string, Entry>>()
  for (const e of entries) {
    if (!inRange(e.date, range)) continue
    let day = byDate.get(e.date)
    if (!day) byDate.set(e.date, (day = new Map()))
    day.set(e.metricId, e)
  }
  const metricsById = new Map(config.metrics.map((m) => [m.id, m]))

  return eachDay(range).map((date) => {
    const due = dueMetrics(config, date, tag)
    const day = byDate.get(date)
    let answered = 0
    let total = 0
    let count = 0

    for (const metric of due) {
      const entry = day?.get(metric.id)
      if (!entry || entry.value === null || entry.value === '') continue
      answered += 1
      const n = normalize(metric, entry.value)
      if (n !== null) {
        total += n
        count += 1
      }
    }
    // Quick-add metrics are not "due", but a recorded flare-up still belongs to
    // the day's picture, so it counts once it exists.
    if (day) {
      for (const [metricId, entry] of day) {
        const metric = metricsById.get(metricId)
        if (!metric || metric.mode !== 'quick') continue
        if (tag && !metric.tags.includes(tag)) continue
        const n = normalize(metric, entry.value)
        if (n !== null) {
          total += n
          count += 1
        }
      }
    }

    return {
      date,
      score: count === 0 ? null : total / count,
      answered,
      due: due.length,
      complete: due.length > 0 && answered === due.length,
    }
  })
}

export interface MetricStats {
  metric: Metric
  /** Days in range on which the metric was due. */
  due: number
  answered: number
  /** Days answered positively (see `isTruthy`). */
  positive: number
  /** `positive / answered`, or `null` when never answered. */
  rate: number | null
  /** Mean of the normalised values, or `null` for categorical metrics. */
  average: number | null
  currentStreak: number
  bestStreak: number
  /** For `choice` metrics: how often each label came up, most frequent first. */
  distribution: { label: string; count: number }[]
}

export function computeMetricStats(
  metric: Metric,
  entries: Entry[],
  range: DateRange,
): MetricStats {
  const values = new Map<ISODate, Entry['value']>()
  for (const e of entries) {
    if (e.metricId === metric.id && inRange(e.date, range)) values.set(e.date, e.value)
  }

  let due = 0
  let answered = 0
  let positive = 0
  let total = 0
  let normalized = 0
  let currentStreak = 0
  let bestStreak = 0
  let runningStreak = 0
  const counts = new Map<string, number>()

  for (const date of eachDay(range)) {
    const isDue = metric.mode !== 'quick' && metric.mode !== 'auto' && isDueOn(metric.schedule, date)
    if (isDue) due += 1
    const value = values.get(date)
    if (value === undefined || value === null || value === '') {
      // Only a day the metric was actually expected breaks a streak; a missing
      // weekend does not ruin a "commute by bike" run.
      if (isDue) runningStreak = 0
      continue
    }
    answered += 1
    if (isTruthy(metric, value)) {
      positive += 1
      runningStreak += 1
      bestStreak = Math.max(bestStreak, runningStreak)
    } else {
      runningStreak = 0
    }
    const n = normalize(metric, value)
    if (n !== null) {
      normalized += n
      total += 1
    }
    if (metric.type === 'choice' || metric.type === 'scale') {
      const label = String(value)
      counts.set(label, (counts.get(label) ?? 0) + 1)
    }
    currentStreak = runningStreak
  }

  return {
    metric,
    due,
    answered,
    positive,
    rate: answered === 0 ? null : positive / answered,
    average: total === 0 ? null : normalized / total,
    currentStreak,
    bestStreak,
    distribution: [...counts.entries()]
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count),
  }
}

export type Bucket = 'day' | 'week' | 'month'

export interface BucketPoint {
  /** First day of the bucket, used as its key and x-axis position. */
  key: ISODate
  /** Mean normalised value over the bucket, or `null` when it holds no data. */
  value: number | null
  /** Number of positive answers — the natural y-axis for counting flare-ups. */
  positive: number
  answered: number
}

export function bucketStart(date: ISODate, bucket: Bucket): ISODate {
  if (bucket === 'week') return startOfWeek(date)
  if (bucket === 'month') return startOfMonth(date)
  return date
}

/** A time series for one metric, ready to be drawn as bars or a line. */
export function bucketSeries(
  metric: Metric,
  entries: Entry[],
  range: DateRange,
  bucket: Bucket,
): BucketPoint[] {
  const acc = new Map<ISODate, { sum: number; norm: number; positive: number; answered: number }>()

  for (const date of eachDay(range)) {
    const key = bucketStart(date, bucket)
    if (!acc.has(key)) acc.set(key, { sum: 0, norm: 0, positive: 0, answered: 0 })
  }
  for (const e of entries) {
    if (e.metricId !== metric.id || !inRange(e.date, range)) continue
    if (e.value === null || e.value === '') continue
    const slot = acc.get(bucketStart(e.date, bucket))
    if (!slot) continue
    slot.answered += 1
    if (isTruthy(metric, e.value)) slot.positive += 1
    const n = normalize(metric, e.value)
    if (n !== null) {
      slot.sum += n
      slot.norm += 1
    }
  }

  return [...acc.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, s]) => ({
      key,
      value: s.norm === 0 ? null : s.sum / s.norm,
      positive: s.positive,
      answered: s.answered,
    }))
}

/**
 * Compare the most recent window against the one before it.
 * Returns the signed difference in positive-answer rate, or `null` when either
 * window is empty — a "trend" computed from no data is worse than no trend.
 */
export function compareWindows(
  metric: Metric,
  entries: Entry[],
  end: ISODate,
  windowDays: number,
): { current: number; previous: number; delta: number } | null {
  const recent = computeMetricStats(metric, entries, {
    from: addDays(end, -(windowDays - 1)),
    to: end,
  })
  const earlier = computeMetricStats(metric, entries, {
    from: addDays(end, -(windowDays * 2 - 1)),
    to: addDays(end, -windowDays),
  })
  if (recent.rate === null || earlier.rate === null) return null
  return { current: recent.rate, previous: earlier.rate, delta: recent.rate - earlier.rate }
}

export interface RangeSummary {
  /** Days holding at least one recorded value. */
  recorded: number
  /** Days in the range, recorded or not. */
  total: number
  /** Days on which every due metric was answered. */
  complete: number
  /** Answered / due over the whole range, or `null` when nothing was ever due. */
  completion: number | null
  /** Mean of the daily scores, ignoring days with nothing to score. */
  averageScore: number | null
  /** Consecutive recorded days ending at the range. */
  currentStreak: number
}

/**
 * Headline figures for a whole period, folded from `summarizeDays`.
 *
 * The streak tolerates an unrecorded *last* day: the dashboard is usually
 * opened before the evening form is filled in, and resetting the streak to zero
 * every morning would be both wrong and demoralising.
 */
export function summarizeRange(days: DaySummary[]): RangeSummary {
  let recorded = 0
  let complete = 0
  let answered = 0
  let due = 0
  let scoreSum = 0
  let scored = 0

  for (const day of days) {
    if (day.answered > 0 || day.score !== null) recorded += 1
    if (day.complete) complete += 1
    answered += day.answered
    due += day.due
    if (day.score !== null) {
      scoreSum += day.score
      scored += 1
    }
  }

  const isRecorded = (day: DaySummary | undefined) =>
    day !== undefined && (day.answered > 0 || day.score !== null)

  let cursor = days.length - 1
  if (cursor >= 0 && !isRecorded(days[cursor])) cursor -= 1
  let currentStreak = 0
  for (; cursor >= 0 && isRecorded(days[cursor]); cursor -= 1) currentStreak += 1

  return {
    recorded,
    total: days.length,
    complete,
    completion: due === 0 ? null : answered / due,
    averageScore: scored === 0 ? null : scoreSum / scored,
    currentStreak,
  }
}
