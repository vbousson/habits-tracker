import { describe, expect, it } from 'vitest'
import { bucketSeries, compareWindows, computeMetricStats, summarizeDays } from '../src/core/stats'
import { parseSchedule } from '../src/core/schedule'
import { entry, metric } from './helpers'
import type { TrackerConfig } from '../src/core/types'

const velo = metric({ id: 'velo', tags: ['sport'], schedule: parseSchedule('weekdays') })
const sport = metric({ id: 'sport', tags: ['sport'] })
const energie = metric({ id: 'energie', type: 'scale', options: ['Faible', 'Moyen', 'Bon'], tags: ['forme'] })
const urticaire = metric({ id: 'urticaire', tags: ['sante'], mode: 'quick', schedule: parseSchedule('never') })

const config: TrackerConfig = { tags: [], goals: [], metrics: [velo, sport, energie, urticaire] }

// 2026-08-31 is a Monday, so this window is exactly one Mon→Sun week.
const WEEK = { from: '2026-08-31', to: '2026-09-06' }

describe('summarizeDays', () => {
  it('returns one row per day of the range, including untouched days', () => {
    expect(summarizeDays(config, [], WEEK)).toHaveLength(7)
  })

  it('separates "not recorded" from "recorded as no"', () => {
    // This is the distinction the heatmap depends on: a null score renders as an
    // empty cell, a score of 0 renders as a filled "bad" cell.
    const [monday] = summarizeDays(config, [entry('2026-08-31', 'sport', false)], WEEK)
    expect(monday?.score).toBe(0)
    const tuesday = summarizeDays(config, [], WEEK)[1]
    expect(tuesday?.score).toBeNull()
  })

  it('counts only the metrics actually due that day', () => {
    const days = summarizeDays(config, [], WEEK)
    expect(days[0]?.due).toBe(3) // Monday: velo + sport + energie
    expect(days[5]?.due).toBe(2) // Saturday: velo is weekdays-only
  })

  it('averages normalised values across the metrics answered', () => {
    const entries = [entry('2026-08-31', 'sport', true), entry('2026-08-31', 'energie', 'Faible')]
    expect(summarizeDays(config, entries, WEEK)[0]?.score).toBeCloseTo(0.5)
  })

  it('marks a day complete only when every due metric is answered', () => {
    const partial = summarizeDays(config, [entry('2026-08-31', 'sport', true)], WEEK)[0]
    expect(partial?.complete).toBe(false)

    const full = summarizeDays(
      config,
      [
        entry('2026-08-31', 'sport', true),
        entry('2026-08-31', 'velo', true),
        entry('2026-08-31', 'energie', 'Bon'),
      ],
      WEEK,
    )[0]
    expect(full?.complete).toBe(true)
  })

  it('filters by tag', () => {
    const days = summarizeDays(config, [], WEEK, 'forme')
    expect(days[0]?.due).toBe(1)
  })

  it('folds a quick-added event into the day even though it was never due', () => {
    const days = summarizeDays(config, [entry('2026-09-02', 'urticaire', true)], WEEK, 'sante')
    expect(days[2]?.score).toBe(1)
    expect(days[2]?.due).toBe(0)
  })

  it('ignores entries outside the range', () => {
    expect(summarizeDays(config, [entry('2026-07-01', 'sport', true)], WEEK)[0]?.score).toBeNull()
  })
})

describe('computeMetricStats', () => {
  it('reports nothing rather than zero when there is no data', () => {
    const stats = computeMetricStats(sport, [], WEEK)
    expect(stats.rate).toBeNull()
    expect(stats.average).toBeNull()
    expect(stats.answered).toBe(0)
  })

  it('computes the positive rate over answered days, not over the range', () => {
    const entries = [
      entry('2026-08-31', 'sport', true),
      entry('2026-09-01', 'sport', false),
      // three days left unanswered
    ]
    const stats = computeMetricStats(sport, entries, WEEK)
    expect(stats.answered).toBe(2)
    expect(stats.positive).toBe(1)
    expect(stats.rate).toBe(0.5)
  })

  it('counts a streak of consecutive positive answers', () => {
    const entries = ['2026-08-31', '2026-09-01', '2026-09-02'].map((d) => entry(d, 'sport', true))
    const stats = computeMetricStats(sport, entries, WEEK)
    expect(stats.currentStreak).toBe(3)
    expect(stats.bestStreak).toBe(3)
  })

  it('breaks a streak on an explicit no', () => {
    const entries = [
      entry('2026-08-31', 'sport', true),
      entry('2026-09-01', 'sport', false),
      entry('2026-09-02', 'sport', true),
    ]
    const stats = computeMetricStats(sport, entries, WEEK)
    expect(stats.bestStreak).toBe(1)
    expect(stats.currentStreak).toBe(1)
  })

  it('does not let a weekend break a weekdays-only streak', () => {
    // Riding to work every working day is an unbroken habit; Saturday is not a failure.
    const entries = ['2026-09-03', '2026-09-04', '2026-09-07'].map((d) => entry(d, 'velo', true))
    const stats = computeMetricStats(velo, entries, { from: '2026-09-01', to: '2026-09-07' })
    expect(stats.bestStreak).toBe(3)
  })

  it('counts due days only on the days the metric applies', () => {
    expect(computeMetricStats(velo, [], WEEK).due).toBe(5)
    expect(computeMetricStats(sport, [], WEEK).due).toBe(7)
    expect(computeMetricStats(urticaire, [], WEEK).due).toBe(0)
  })

  it('builds a distribution for graded metrics, most frequent first', () => {
    const entries = [
      entry('2026-08-31', 'energie', 'Bon'),
      entry('2026-09-01', 'energie', 'Bon'),
      entry('2026-09-02', 'energie', 'Faible'),
    ]
    expect(computeMetricStats(energie, entries, WEEK).distribution).toEqual([
      { label: 'Bon', count: 2 },
      { label: 'Faible', count: 1 },
    ])
  })
})

describe('bucketSeries', () => {
  it('produces one point per bucket covering the whole range', () => {
    const points = bucketSeries(sport, [], { from: '2026-08-31', to: '2026-09-13' }, 'week')
    expect(points.map((p) => p.key)).toEqual(['2026-08-31', '2026-09-07'])
  })

  it('leaves empty buckets null instead of inventing a reading', () => {
    const entries = [entry('2026-08-31', 'sport', true)]
    const points = bucketSeries(sport, entries, { from: '2026-08-31', to: '2026-09-13' }, 'week')
    expect(points[0]?.value).toBe(1)
    expect(points[1]?.value).toBeNull()
    expect(points[1]?.answered).toBe(0)
  })

  it('counts positives separately from the mean', () => {
    const entries = [
      entry('2026-08-31', 'sport', true),
      entry('2026-09-01', 'sport', false),
    ]
    const [week] = bucketSeries(sport, entries, WEEK, 'week')
    expect(week?.positive).toBe(1)
    expect(week?.answered).toBe(2)
    expect(week?.value).toBe(0.5)
  })

  it('buckets by day and by month too', () => {
    const range = { from: '2026-08-30', to: '2026-09-02' }
    expect(bucketSeries(sport, [], range, 'day')).toHaveLength(4)
    expect(bucketSeries(sport, [], range, 'month').map((p) => p.key)).toEqual([
      '2026-08-01', '2026-09-01',
    ])
  })
})

describe('compareWindows', () => {
  it('returns null rather than a trend computed from nothing', () => {
    expect(compareWindows(sport, [], '2026-09-06', 7)).toBeNull()
  })

  it('measures the change in positive rate between adjacent windows', () => {
    const entries = [
      // previous week: 0 / 2
      entry('2026-08-25', 'sport', false),
      entry('2026-08-26', 'sport', false),
      // current week: 2 / 2
      entry('2026-09-01', 'sport', true),
      entry('2026-09-02', 'sport', true),
    ]
    const result = compareWindows(sport, entries, '2026-09-06', 7)
    expect(result).not.toBeNull()
    expect(result?.previous).toBe(0)
    expect(result?.current).toBe(1)
    expect(result?.delta).toBe(1)
  })
})
