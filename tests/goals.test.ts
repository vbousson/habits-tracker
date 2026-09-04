/**
 * The goals engine is arithmetic that produces a *verdict* about someone's own
 * life. A silent off-by-one on a week boundary would not crash anything — it
 * would just tell the owner he missed a goal he actually met, for months. So
 * this file is deliberately paranoid about period bounds, about the future, and
 * about the five outcomes.
 *
 * Every date here is real: 2026-08-31 is a Monday, 2026-09-06 the Sunday that
 * closes the same week.
 */
import { describe, expect, it } from 'vitest'
import {
  activeGoalsOn, clipToValidity, evaluateGoal, evaluateGoals, goalHistory, goalPeriod,
  nextGoalId, supersede,
} from '../src/core/goals'
import { parseSchedule } from '../src/core/schedule'
import { parseGoals, parseMetrics } from '../src/core/tabular'
import { starterConfigRows } from '../src/data/starter'
import { starterGoalRows } from '../src/data/starterGoals'
import { entry, metric } from './helpers'
import type { Goal, TrackerConfig } from '../src/core/types'

const MONDAY = '2026-08-31'
const TUESDAY = '2026-09-01'
const WEDNESDAY = '2026-09-02'
const THURSDAY = '2026-09-03'
const FRIDAY = '2026-09-04'
const SATURDAY = '2026-09-05'
const SUNDAY = '2026-09-06'
/** Comfortably after the week above: every period below is closed on this day. */
const LATER = '2026-09-20'

const velo = metric({ id: 'velo', tags: ['sport'], schedule: parseSchedule('weekdays') })
const sport = metric({ id: 'sport', tags: ['sport'] })
const club = metric({ id: 'club', tags: ['sport'] })
const repas = metric({ id: 'repas', tags: ['alimentation'] })
const travail = metric({ id: 'travail', tags: ['travail'] })
const grignotage = metric({ id: 'grignotage', tags: ['alimentation'] })
const duree = metric({ id: 'duree', type: 'number', unit: 'min', tags: ['sport'] })
const sommeil = metric({
  id: 'sommeil',
  type: 'scale',
  options: ['Faible', 'Moyen', 'Bon'],
  tags: ['forme'],
  schedule: parseSchedule('weekdays'),
})

const configOf = (goals: Goal[]): TrackerConfig => ({
  tags: [],
  goals,
  metrics: [velo, sport, club, repas, travail, grignotage, duree, sommeil],
})

function goal(partial: Partial<Goal> & Pick<Goal, 'id' | 'metrics'>): Goal {
  return {
    label: partial.id,
    aggregate: 'count',
    comparator: '>=',
    target: 2,
    period: 'week',
    from: '',
    tags: [],
    active: true,
    order: 0,
    ...partial,
  }
}

describe('goalPeriod', () => {
  it('anchors a week on the Monday, so Sunday still belongs to the week that started', () => {
    // The whole French week reading depends on this: a Sunday evening entry must
    // land in the week just ending, not in the one about to start.
    expect(goalPeriod(goal({ id: 'g', metrics: [] }), SUNDAY)).toEqual({
      from: MONDAY,
      to: SUNDAY,
    })
    expect(goalPeriod(goal({ id: 'g', metrics: [] }), MONDAY)).toEqual({ from: MONDAY, to: SUNDAY })
  })

  it('reduces a day period to the day itself', () => {
    expect(goalPeriod(goal({ id: 'g', metrics: [], period: 'day' }), WEDNESDAY)).toEqual({
      from: WEDNESDAY,
      to: WEDNESDAY,
    })
  })

  it('ends a month on its real last day, February included', () => {
    const g = goal({ id: 'g', metrics: [], period: 'month' })
    expect(goalPeriod(g, '2026-09-15')).toEqual({ from: '2026-09-01', to: '2026-09-30' })
    expect(goalPeriod(g, '2026-02-10')).toEqual({ from: '2026-02-01', to: '2026-02-28' })
    expect(goalPeriod(g, '2026-01-31')).toEqual({ from: '2026-01-01', to: '2026-01-31' })
  })

  it('ends a rolling window on the reference day and spans exactly windowDays', () => {
    const g = goal({ id: 'g', metrics: [], period: 'rolling', windowDays: 30 })
    // 30 days *including* 2026-09-05, hence 2026-08-07 and not 2026-08-06.
    expect(goalPeriod(g, SATURDAY)).toEqual({ from: '2026-08-07', to: SATURDAY })
  })

  it('defaults a rolling window to 7 days', () => {
    const g = goal({ id: 'g', metrics: [], period: 'rolling' })
    expect(goalPeriod(g, SATURDAY)).toEqual({ from: '2026-08-30', to: SATURDAY })
  })
})

describe('clipToValidity', () => {
  const period = { from: MONDAY, to: SUNDAY }

  it('treats empty from/to as unbounded', () => {
    expect(clipToValidity(goal({ id: 'g', metrics: [] }), period)).toEqual(period)
  })

  it('never widens a period', () => {
    const g = goal({ id: 'g', metrics: [], from: '2026-01-01', to: '2026-12-31' })
    expect(clipToValidity(g, period)).toEqual(period)
  })

  it('cuts the period down to the goal validity', () => {
    const g = goal({ id: 'g', metrics: [], from: FRIDAY, to: SATURDAY })
    expect(clipToValidity(g, period)).toEqual({ from: FRIDAY, to: SATURDAY })
  })
})

describe('activeGoalsOn', () => {
  const goals = [
    goal({ id: 'current', metrics: ['velo'], from: '2026-01-01' }),
    goal({ id: 'old', metrics: ['velo'], from: '2025-01-01', to: '2025-12-31' }),
    goal({ id: 'future', metrics: ['velo'], from: '2027-01-01' }),
    goal({ id: 'off', metrics: ['velo'], active: false }),
  ]

  it('keeps only the goals in force on the date', () => {
    expect(activeGoalsOn(goals, MONDAY).map((g) => g.id)).toEqual(['current'])
  })

  it('brings back the closed goal when looking at a date it covered', () => {
    // This is the point of from/to: a chart of 2025 must be judged against the
    // 2025 bar, not against today's.
    expect(activeGoalsOn(goals, '2025-06-15').map((g) => g.id)).toEqual(['old'])
  })
})

describe('count', () => {
  it('counts days, not answers', () => {
    const g = goal({ id: 'g', metrics: ['velo'], target: 2 })
    const entries = [entry(MONDAY, 'velo', true), entry(TUESDAY, 'velo', true)]
    const r = evaluateGoal(g, configOf([g]), entries, MONDAY, LATER)
    expect(r.value).toBe(2)
    expect(r.positiveDays).toBe(2)
    expect(r.met).toBe(true)
  })

  it('is satisfied by any of its metrics — one session is one session', () => {
    // "Bouger 3 fois" must not need three separate targets: a bike commute, a
    // club session and an evening workout are interchangeable.
    const g = goal({ id: 'g', metrics: ['sport', 'club', 'velo'], target: 3 })
    const entries = [
      entry(MONDAY, 'velo', true),
      entry(WEDNESDAY, 'club', true),
      entry(FRIDAY, 'sport', true),
    ]
    expect(evaluateGoal(g, configOf([g]), entries, MONDAY, LATER).value).toBe(3)
  })

  it('counts a day once even when two of the metrics fired', () => {
    const g = goal({ id: 'g', metrics: ['sport', 'club'], target: 2 })
    const entries = [entry(MONDAY, 'sport', true), entry(MONDAY, 'club', true)]
    expect(evaluateGoal(g, configOf([g]), entries, MONDAY, LATER).value).toBe(1)
  })

  it('does not count an explicit "no", which is a real answer', () => {
    const g = goal({ id: 'g', metrics: ['velo'] })
    const entries = [entry(MONDAY, 'velo', false), entry(TUESDAY, 'velo', true)]
    expect(evaluateGoal(g, configOf([g]), entries, MONDAY, LATER).value).toBe(1)
  })

  it('treats the lowest level of a scale as falsy, like the rest of the app', () => {
    const g = goal({ id: 'g', metrics: ['sommeil'], target: 1 })
    const entries = [entry(MONDAY, 'sommeil', 'Faible')]
    expect(evaluateGoal(g, configOf([g]), entries, MONDAY, LATER).value).toBe(0)
  })
})

describe('sum, average, rate and streak', () => {
  it('sums the numeric answers over the period', () => {
    const g = goal({ id: 'g', metrics: ['duree'], aggregate: 'sum', target: 90 })
    const entries = [entry(MONDAY, 'duree', 30), entry(WEDNESDAY, 'duree', 60)]
    const r = evaluateGoal(g, configOf([g]), entries, MONDAY, LATER)
    expect(r.value).toBe(90)
    expect(r.met).toBe(true)
  })

  it('averages a number metric on its own raw scale', () => {
    const g = goal({ id: 'g', metrics: ['duree'], aggregate: 'average', target: 40 })
    const entries = [entry(MONDAY, 'duree', 30), entry(WEDNESDAY, 'duree', 60)]
    expect(evaluateGoal(g, configOf([g]), entries, MONDAY, LATER).value).toBe(45)
  })

  it('averages a scale as a 0-100 percentage of its levels', () => {
    // The judgement call, asserted so it cannot drift: "Bon" on a three-level
    // scale is 100, "Moyen" 50, "Faible" 0 — which puts `average` on the same
    // footing as `rate`, where a target of 70 also means 70 %.
    const g = goal({ id: 'g', metrics: ['sommeil'], aggregate: 'average', target: 70 })
    const entries = [entry(MONDAY, 'sommeil', 'Bon'), entry(TUESDAY, 'sommeil', 'Moyen')]
    expect(evaluateGoal(g, configOf([g]), entries, MONDAY, LATER).value).toBe(75)
  })

  it('averages nothing to 0 rather than NaN', () => {
    const g = goal({ id: 'g', metrics: ['duree'], aggregate: 'average', target: 40 })
    expect(evaluateGoal(g, configOf([g]), [], MONDAY, LATER).value).toBe(0)
  })

  it('reports rate as a percentage, not a fraction', () => {
    // The starter goals write `target: 70` for "70 % of nights", so the value
    // has to be on the same scale.
    const g = goal({ id: 'g', metrics: ['sommeil'], aggregate: 'rate', target: 70 })
    const entries = [
      entry(MONDAY, 'sommeil', 'Bon'),
      entry(TUESDAY, 'sommeil', 'Faible'),
      entry(WEDNESDAY, 'sommeil', 'Moyen'),
      entry(FRIDAY, 'sommeil', 'Bon'),
    ]
    const r = evaluateGoal(g, configOf([g]), entries, MONDAY, LATER)
    // Sommeil is weekdays-only, so the denominator is 5 days and not 7.
    expect(r.eligibleDays).toBe(5)
    expect(r.positiveDays).toBe(3)
    expect(r.value).toBe(60)
    expect(r.met).toBe(false)
  })

  it('keeps days the question was never asked out of the rate denominator', () => {
    // Without this, a weekdays-only metric could never exceed 5/7 = 71 %, and a
    // "70 %" target would be measuring the schedule instead of the habit.
    const g = goal({ id: 'g', metrics: ['sommeil'], aggregate: 'rate', target: 100 })
    const entries = [
      entry(MONDAY, 'sommeil', 'Bon'),
      entry(TUESDAY, 'sommeil', 'Bon'),
      entry(WEDNESDAY, 'sommeil', 'Bon'),
      entry(THURSDAY, 'sommeil', 'Bon'),
      entry(FRIDAY, 'sommeil', 'Bon'),
    ]
    const r = evaluateGoal(g, configOf([g]), entries, MONDAY, LATER)
    expect(r.value).toBe(100)
    expect(r.met).toBe(true)
  })

  it('measures the longest run of positive days for streak', () => {
    const g = goal({ id: 'g', metrics: ['sport'], aggregate: 'streak', target: 3 })
    const entries = [
      entry(MONDAY, 'sport', true),
      entry(TUESDAY, 'sport', true),
      entry(WEDNESDAY, 'sport', true),
      entry(THURSDAY, 'sport', false),
      entry(FRIDAY, 'sport', true),
    ]
    const r = evaluateGoal(g, configOf([g]), entries, MONDAY, LATER)
    expect(r.value).toBe(3)
    expect(r.met).toBe(true)
  })

  it('does not let a day the goal ignores break a streak', () => {
    // A commute streak survives a day off work; only an eligible day resets it.
    const g = goal({
      id: 'g',
      metrics: ['velo'],
      aggregate: 'streak',
      target: 4,
      onlyWhen: 'travail',
    })
    const entries = [
      entry(MONDAY, 'travail', true), entry(MONDAY, 'velo', true),
      entry(TUESDAY, 'travail', true), entry(TUESDAY, 'velo', true),
      entry(WEDNESDAY, 'travail', false),
      entry(THURSDAY, 'travail', true), entry(THURSDAY, 'velo', true),
      entry(FRIDAY, 'travail', true), entry(FRIDAY, 'velo', true),
    ]
    const r = evaluateGoal(g, configOf([g]), entries, MONDAY, LATER)
    expect(r.eligibleDays).toBe(4)
    expect(r.value).toBe(4)
  })
})

describe('onlyWhen', () => {
  const g = goal({ id: 'g', metrics: ['repas'], target: 4, onlyWhen: 'travail' })
  const entries = [
    entry(MONDAY, 'travail', true), entry(MONDAY, 'repas', true),
    entry(TUESDAY, 'travail', true), entry(TUESDAY, 'repas', true),
    entry(WEDNESDAY, 'travail', true),
    entry(THURSDAY, 'travail', true),
    entry(FRIDAY, 'travail', false), entry(FRIDAY, 'repas', true),
  ]

  it('shrinks the eligible days to the ones the condition held', () => {
    const r = evaluateGoal(g, configOf([g]), entries, MONDAY, LATER)
    expect(r.eligibleDays).toBe(4)
  })

  it('ignores a positive answer recorded on an ineligible day', () => {
    // Bringing lunch on a day off is not "bringing lunch to work", and counting
    // it would let the goal be met without ever going to the office.
    const r = evaluateGoal(g, configOf([g]), entries, MONDAY, LATER)
    expect(r.value).toBe(2)
  })

  it('is ignored, not fatal, when the condition metric was deleted', () => {
    const orphan = goal({ id: 'g', metrics: ['repas'], target: 1, onlyWhen: 'disparu' })
    const r = evaluateGoal(orphan, configOf([orphan]), entries, MONDAY, LATER)
    expect(r.missingMetrics).toEqual(['disparu'])
    expect(r.eligibleDays).toBe(7)
    expect(r.value).toBe(3)
  })
})

describe('clipping to the goal validity', () => {
  it('judges a goal created mid-week only on the days it existed', () => {
    // Reporting "1 / 2, manqué" for a goal born on Friday would be a verdict on
    // days the user had not committed to anything.
    const g = goal({ id: 'g', metrics: ['velo'], target: 2, from: FRIDAY })
    const entries = [entry(MONDAY, 'velo', true), entry(SATURDAY, 'velo', true)]
    const r = evaluateGoal(g, configOf([g]), entries, MONDAY, LATER)
    expect(r.bounds).toEqual({ from: FRIDAY, to: SUNDAY })
    expect(r.partial).toBe(true)
    expect(r.eligibleDays).toBe(3)
    expect(r.value).toBe(1)
  })

  it('stops judging after the goal was closed', () => {
    const g = goal({ id: 'g', metrics: ['velo'], target: 2, to: TUESDAY })
    const entries = [entry(TUESDAY, 'velo', true), entry(THURSDAY, 'velo', true)]
    const r = evaluateGoal(g, configOf([g]), entries, MONDAY, LATER)
    expect(r.bounds).toEqual({ from: MONDAY, to: TUESDAY })
    expect(r.partial).toBe(true)
    expect(r.value).toBe(1)
  })

  it('flags a full period as not partial', () => {
    const g = goal({ id: 'g', metrics: ['velo'], from: '2020-01-01' })
    const r = evaluateGoal(g, configOf([g]), [], MONDAY, LATER)
    expect(r.partial).toBe(false)
    expect(r.empty).toBe(false)
  })

  it('reports an empty period instead of a missed one', () => {
    const g = goal({ id: 'g', metrics: ['velo'], target: 2, from: '2026-09-10' })
    const r = evaluateGoal(g, configOf([g]), [], MONDAY, LATER)
    expect(r.empty).toBe(true)
    expect(r.eligibleDays).toBe(0)
    expect(r.value).toBe(0)
    // Nothing was judged, so there is no verdict to give — "missed" would be a lie.
    expect(r.outcome).toBe('pending')
  })
})

describe('the future never counts against you', () => {
  const g = goal({ id: 'g', metrics: ['sport'], target: 7 })
  const entries = [
    entry(MONDAY, 'sport', true),
    entry(TUESDAY, 'sport', true),
    entry(WEDNESDAY, 'sport', true),
  ]

  it('does not treat the days ahead as failures', () => {
    const r = evaluateGoal(g, configOf([g]), entries, MONDAY, WEDNESDAY)
    expect(r.eligibleDays).toBe(3)
    expect(r.positiveDays).toBe(3)
    expect(r.daysLeft).toBe(4)
    expect(r.outcome).not.toBe('missed')
  })

  it('closes the period once every day is behind', () => {
    const r = evaluateGoal(g, configOf([g]), entries, MONDAY, LATER)
    expect(r.daysLeft).toBe(0)
    expect(r.outcome).toBe('missed')
  })

  it('has nothing to judge on a period entirely ahead of today', () => {
    const r = evaluateGoal(g, configOf([g]), entries, '2026-09-14', SUNDAY)
    expect(r.eligibleDays).toBe(0)
    expect(r.daysLeft).toBe(7)
    expect(r.outcome).toBe('pending')
  })

  it('counts remaining days optimistically for an onlyWhen goal', () => {
    // Whether next Thursday is a work day is unknowable from an answer that does
    // not exist yet, so the days ahead stay countable rather than vanishing.
    const restricted = goal({ id: 'r', metrics: ['repas'], target: 4, onlyWhen: 'travail' })
    const r = evaluateGoal(restricted, configOf([restricted]), [], MONDAY, WEDNESDAY)
    expect(r.eligibleDays).toBe(0)
    expect(r.daysLeft).toBe(4)
  })
})

describe('outcome', () => {
  const weekly = (target: number, comparator: Goal['comparator'] = '>=') =>
    goal({ id: 'g', metrics: ['sport'], target, comparator })

  const on = (days: string[]) => days.map((d) => entry(d, 'sport', true))

  it('is met as soon as a lower bound clears its bar', () => {
    const g = weekly(2)
    expect(evaluateGoal(g, configOf([g]), on([MONDAY, TUESDAY]), MONDAY, TUESDAY).outcome).toBe('met')
  })

  it('is missed once a closed period fell short', () => {
    const g = weekly(2)
    expect(evaluateGoal(g, configOf([g]), on([MONDAY]), MONDAY, LATER).outcome).toBe('missed')
  })

  it('is pending while the target is still comfortably reachable', () => {
    const g = weekly(3)
    const r = evaluateGoal(g, configOf([g]), on([MONDAY]), MONDAY, WEDNESDAY)
    expect(r.outcome).toBe('pending')
  })

  it('is at_risk when only a perfect run of the remaining days gets there', () => {
    // 1 done, 2 days left, 3 needed: one slip and it is gone.
    const g = weekly(3)
    const r = evaluateGoal(g, configOf([g]), on([MONDAY]), MONDAY, FRIDAY)
    expect(r.daysLeft).toBe(2)
    expect(r.outcome).toBe('at_risk')
  })

  it('is impossible when even a perfect run cannot reach the target', () => {
    const g = weekly(3)
    const r = evaluateGoal(g, configOf([g]), on([MONDAY]), MONDAY, SATURDAY)
    expect(r.daysLeft).toBe(1)
    expect(r.outcome).toBe('impossible')
  })

  it('never declares a sum goal impossible, because a day has no ceiling', () => {
    const g = goal({ id: 'g', metrics: ['duree'], aggregate: 'sum', target: 500 })
    const r = evaluateGoal(g, configOf([g]), [], MONDAY, SATURDAY)
    expect(r.outcome).toBe('pending')
  })

  describe('for an upper bound, which is a budget', () => {
    const budget = goal({ id: 'b', metrics: ['grignotage'], target: 2, comparator: '<=' })
    const nights = (days: string[]) => days.map((d) => entry(d, 'grignotage', true))

    it('is impossible once the allowance is overspent — a budget never goes back down', () => {
      const r = evaluateGoal(
        budget, configOf([budget]), nights([MONDAY, TUESDAY, WEDNESDAY]), MONDAY, WEDNESDAY,
      )
      expect(r.value).toBe(3)
      expect(r.outcome).toBe('impossible')
    })

    it('is already met when even spending every remaining day stays under', () => {
      const r = evaluateGoal(budget, configOf([budget]), [], MONDAY, SATURDAY)
      expect(r.daysLeft).toBe(1)
      expect(r.outcome).toBe('met')
    })

    it('is at_risk when the allowance is spent but the period is still open', () => {
      const r = evaluateGoal(budget, configOf([budget]), nights([MONDAY, TUESDAY]), MONDAY, FRIDAY)
      expect(r.met).toBe(true)
      expect(r.outcome).toBe('at_risk')
    })

    it('is pending while there is still slack', () => {
      const r = evaluateGoal(budget, configOf([budget]), [], MONDAY, TUESDAY)
      expect(r.outcome).toBe('pending')
    })

    it('is met when the closed period stayed inside the budget', () => {
      const r = evaluateGoal(budget, configOf([budget]), nights([MONDAY]), MONDAY, LATER)
      expect(r.outcome).toBe('met')
    })
  })
})

describe('direction, progress, consumed and remaining', () => {
  it('reads a lower bound as progress towards the bar', () => {
    const g = goal({ id: 'g', metrics: ['sport'], target: 4 })
    const entries = [entry(MONDAY, 'sport', true)]
    const r = evaluateGoal(g, configOf([g]), entries, MONDAY, LATER)
    expect(r.direction).toBe('at_least')
    expect(r.progress).toBe(0.25)
    expect(r.consumed).toBe(0)
    expect(r.remaining).toBe(3)
  })

  it('caps progress at 1 when the bar is beaten', () => {
    const g = goal({ id: 'g', metrics: ['sport'], target: 2 })
    const entries = [MONDAY, TUESDAY, WEDNESDAY].map((d) => entry(d, 'sport', true))
    const r = evaluateGoal(g, configOf([g]), entries, MONDAY, LATER)
    expect(r.progress).toBe(1)
    expect(r.remaining).toBe(0)
  })

  it('reads an upper bound as a budget: progress is the verdict, consumed is the spend', () => {
    // The distinction that matters most in the result type. Drawing `consumed`
    // as progress would show a "full" bar for someone who snacked every night.
    const g = goal({ id: 'g', metrics: ['grignotage'], target: 2, comparator: '<=' })
    const entries = [entry(MONDAY, 'grignotage', true)]
    const r = evaluateGoal(g, configOf([g]), entries, MONDAY, LATER)
    expect(r.direction).toBe('at_most')
    expect(r.met).toBe(true)
    expect(r.progress).toBe(1)
    expect(r.consumed).toBe(0.5)
    // "How many more days do you need?" is meaningless for a budget.
    expect(r.remaining).toBeNull()
  })

  it('drops progress to 0 the moment a budget breaks', () => {
    const g = goal({ id: 'g', metrics: ['grignotage'], target: 2, comparator: '<=' })
    const entries = [MONDAY, TUESDAY, WEDNESDAY].map((d) => entry(d, 'grignotage', true))
    const r = evaluateGoal(g, configOf([g]), entries, MONDAY, LATER)
    expect(r.progress).toBe(0)
    expect(r.consumed).toBe(1)
  })

  it('files "exactly" under at_least, so an empty week does not draw a full bar', () => {
    const g = goal({ id: 'g', metrics: ['sport'], target: 7, comparator: '==' })
    const r = evaluateGoal(g, configOf([g]), [], MONDAY, LATER)
    expect(r.direction).toBe('at_least')
    expect(r.progress).toBe(0)
  })

  it('needs one extra day for a strict lower bound', () => {
    const g = goal({ id: 'g', metrics: ['sport'], target: 2, comparator: '>' })
    const entries = [MONDAY, TUESDAY].map((d) => entry(d, 'sport', true))
    const r = evaluateGoal(g, configOf([g]), entries, MONDAY, LATER)
    expect(r.met).toBe(false)
    expect(r.remaining).toBe(1)
  })

  it('reports no remaining count for a non-count aggregate', () => {
    const g = goal({ id: 'g', metrics: ['duree'], aggregate: 'sum', target: 100 })
    expect(evaluateGoal(g, configOf([g]), [], MONDAY, LATER).remaining).toBeNull()
  })
})

describe('a target of 0', () => {
  it('never divides by zero', () => {
    const g = goal({ id: 'g', metrics: ['grignotage'], target: 0, comparator: '<=' })
    const clean = evaluateGoal(g, configOf([g]), [], MONDAY, LATER)
    expect(clean.met).toBe(true)
    expect(clean.progress).toBe(1)
    expect(clean.consumed).toBe(0)
    expect(Number.isFinite(clean.consumed)).toBe(true)

    const broken = evaluateGoal(g, configOf([g]), [entry(MONDAY, 'grignotage', true)], MONDAY, LATER)
    expect(broken.met).toBe(false)
    expect(broken.progress).toBe(0)
    expect(broken.consumed).toBe(1)
    // Closed, so the verdict is final: "missed", not "impossible". `impossible`
    // only ever describes a period still running.
    expect(broken.outcome).toBe('missed')

    const running = evaluateGoal(g, configOf([g]), [entry(MONDAY, 'grignotage', true)], MONDAY, TUESDAY)
    expect(running.outcome).toBe('impossible')
  })

  it('treats a lower bound of 0 as trivially met rather than as NaN', () => {
    const g = goal({ id: 'g', metrics: ['sport'], target: 0 })
    const r = evaluateGoal(g, configOf([g]), [], MONDAY, LATER)
    expect(r.met).toBe(true)
    expect(r.progress).toBe(1)
    expect(r.outcome).toBe('met')
  })
})

describe('a goal pointing at a metric that no longer exists', () => {
  it('degrades instead of throwing', () => {
    const g = goal({ id: 'g', metrics: ['disparu'], target: 2 })
    const r = evaluateGoal(g, configOf([g]), [entry(MONDAY, 'disparu', true)], MONDAY, LATER)
    expect(r.metrics).toEqual([])
    expect(r.missingMetrics).toEqual(['disparu'])
    expect(r.value).toBe(0)
    expect(r.outcome).toBe('missed')
  })

  it('still measures the metrics that survived', () => {
    const g = goal({ id: 'g', metrics: ['disparu', 'sport'], target: 1 })
    const r = evaluateGoal(g, configOf([g]), [entry(MONDAY, 'sport', true)], MONDAY, LATER)
    expect(r.metrics.map((m) => m.id)).toEqual(['sport'])
    expect(r.missingMetrics).toEqual(['disparu'])
    expect(r.value).toBe(1)
  })
})

describe('evaluateGoals', () => {
  it('evaluates every goal in force and skips the rest', () => {
    const goals = [
      goal({ id: 'a', metrics: ['sport'], target: 1, order: 20 }),
      goal({ id: 'b', metrics: ['velo'], target: 1, order: 10 }),
      goal({ id: 'gone', metrics: ['velo'], to: '2026-01-01' }),
    ]
    const results = evaluateGoals(configOf(goals), [entry(MONDAY, 'sport', true)], MONDAY, LATER)
    expect(results.map((r) => r.goal.id)).toEqual(['b', 'a'])
    expect(results.map((r) => r.met)).toEqual([false, true])
  })
})

describe('goalHistory', () => {
  const g = goal({ id: 'g', metrics: ['sport'], target: 1 })
  const entries = [entry('2026-08-18', 'sport', true), entry(MONDAY, 'sport', true)]

  it('returns one result per week, oldest first', () => {
    const history = goalHistory(g, configOf([g]), entries, { from: '2026-08-17', to: SUNDAY }, SUNDAY)
    expect(history.map((r) => r.bounds.from)).toEqual(['2026-08-17', '2026-08-24', MONDAY])
    expect(history.map((r) => r.met)).toEqual([true, false, true])
  })

  it('starts the strip on the Monday of the week the range opens in', () => {
    const history = goalHistory(g, configOf([g]), entries, { from: '2026-08-19', to: SUNDAY }, SUNDAY)
    expect(history[0]?.bounds.from).toBe('2026-08-17')
  })

  it('drops the weeks the goal did not exist yet', () => {
    const late = goal({ id: 'g', metrics: ['sport'], target: 1, from: '2026-08-24' })
    const history = goalHistory(late, configOf([late]), entries, { from: '2026-08-17', to: SUNDAY }, SUNDAY)
    expect(history).toHaveLength(2)
    expect(history[0]?.bounds.from).toBe('2026-08-24')
  })

  it('walks rolling windows backwards from the end, so the last one ends today', () => {
    const rolling = goal({ id: 'g', metrics: ['sport'], period: 'rolling', windowDays: 7, target: 1 })
    const history = goalHistory(
      rolling, configOf([rolling]), entries, { from: '2026-08-17', to: SUNDAY }, SUNDAY,
    )
    expect(history[history.length - 1]?.bounds).toEqual({ from: MONDAY, to: SUNDAY })
  })

  it('returns nothing for an inverted range', () => {
    expect(goalHistory(g, configOf([g]), entries, { from: SUNDAY, to: MONDAY }, SUNDAY)).toEqual([])
  })
})

describe('supersede', () => {
  const original = goal({ id: 'obj_velo', metrics: ['velo'], target: 2, from: '2026-01-01' })

  it('closes the previous goal the day before the new one starts', () => {
    const [closed, next] = supersede(original, { target: 3 }, TUESDAY)
    expect(closed.to).toBe(MONDAY)
    expect(next.from).toBe(TUESDAY)
    // No overlap: exactly one of the two applies on any given day.
    expect(closed.to! < next.from).toBe(true)
  })

  it('keeps the old row intact apart from its end date', () => {
    const [closed] = supersede(original, { target: 3 }, TUESDAY)
    expect(closed.id).toBe('obj_velo')
    expect(closed.target).toBe(2)
    expect(closed.from).toBe('2026-01-01')
  })

  it('gives the replacement a fresh id so the upsert cannot swallow the old row', () => {
    const [, next] = supersede(original, { target: 3 }, TUESDAY)
    expect(next.id).toBe('obj_velo_v2')
    expect(next.target).toBe(3)
    expect(next.to).toBeUndefined()
    expect(next.active).toBe(true)
  })

  it('skips ids already taken, including a goal already superseded once', () => {
    const already = goal({ id: 'obj_velo_v2', metrics: ['velo'], target: 3 })
    const [, next] = supersede(already, { target: 4 }, TUESDAY, [original, already])
    expect(next.id).toBe('obj_velo_v3')
  })

  it('never reuses the id of an unrelated existing goal', () => {
    const clash = goal({ id: 'obj_velo_v2', metrics: ['velo'] })
    const [, next] = supersede(original, { target: 3 }, TUESDAY, [original, clash])
    expect(next.id).toBe('obj_velo_v3')
  })

  it('produces a pair that reads back as one goal per date', () => {
    const [closed, next] = supersede(original, { target: 3 }, TUESDAY)
    const goals = [closed, next]
    expect(activeGoalsOn(goals, MONDAY).map((g) => g.target)).toEqual([2])
    expect(activeGoalsOn(goals, TUESDAY).map((g) => g.target)).toEqual([3])
  })

  it('derives ids without a version suffix from the base', () => {
    expect(nextGoalId('obj_sport')).toBe('obj_sport_v2')
    expect(nextGoalId('obj_sport_v9')).toBe('obj_sport_v10')
    expect(nextGoalId('obj_sport', ['obj_sport_v2', 'obj_sport_v3'])).toBe('obj_sport_v4')
  })
})

describe('the shipped starter template', () => {
  const metrics = parseMetrics(starterConfigRows())
  const goals = parseGoals(starterGoalRows())
  const config: TrackerConfig = { metrics, tags: [], goals }

  it('references only metrics that exist', () => {
    // A broken starter template is a bug every single new user meets on day one.
    const ids = new Set(metrics.map((m) => m.id))
    const dangling = goals.flatMap((g) =>
      [...g.metrics, ...(g.onlyWhen ? [g.onlyWhen] : [])].filter((id) => !ids.has(id)),
    )
    expect(dangling).toEqual([])
  })

  it('evaluates end to end without throwing, on data and on nothing', () => {
    expect(evaluateGoals(config, [], SUNDAY, SUNDAY)).toHaveLength(goals.length)
    const entries = [entry(MONDAY, 'velo_travail', true), entry(MONDAY, 'sommeil', 'Bon')]
    for (const r of evaluateGoals(config, entries, SUNDAY, SUNDAY)) {
      expect(Number.isFinite(r.value)).toBe(true)
      expect(r.progress).toBeGreaterThanOrEqual(0)
      expect(r.progress).toBeLessThanOrEqual(1)
      expect(r.missingMetrics).toEqual([])
    }
  })
})
