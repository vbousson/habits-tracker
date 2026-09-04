import { describe, expect, it } from 'vitest'
import { buildDailyForm, buildQuickForm, formProgress, quickAddMetrics } from '../src/core/form'
import { parseSchedule } from '../src/core/schedule'
import { metric } from './helpers'
import type { Answers } from '../src/core/form'
import type { TrackerConfig } from '../src/core/types'

const FRIDAY = '2026-09-04'
const SATURDAY = '2026-09-05'

const config: TrackerConfig = {
  tags: [],
  goals: [],
  metrics: [
    metric({ id: 'velo', group: 'Sport', schedule: parseSchedule('weekdays'), order: 1 }),
    metric({ id: 'sport', group: 'Sport', order: 2 }),
    metric({ id: 'energie', group: 'Forme', type: 'scale', options: ['Faible', 'Bon'], order: 3 }),
    metric({ id: 'urticaire', group: 'Santé', schedule: parseSchedule('never'), mode: 'quick', order: 4 }),
    metric({ id: 'intensite', group: 'Santé', type: 'scale', options: ['Légère', 'Forte'], dependsOn: 'urticaire', order: 5 }),
    metric({ id: 'cause', group: 'Santé', type: 'text', dependsOn: 'urticaire', order: 6 }),
    metric({ id: 'inactif', group: 'Sport', active: false, order: 7 }),
  ],
}

const answers = (pairs: Record<string, unknown> = {}): Answers =>
  new Map(Object.entries(pairs)) as Answers

describe('buildDailyForm', () => {
  it('groups fields by section, preserving configured order', () => {
    const sections = buildDailyForm(config, FRIDAY, answers())
    expect(sections.map((s) => s.group)).toEqual(['Sport', 'Forme'])
    expect(sections[0]?.fields.map((f) => f.metric.id)).toEqual(['velo', 'sport'])
  })

  it('honours the weekday schedule', () => {
    const friday = buildDailyForm(config, FRIDAY, answers())
    const saturday = buildDailyForm(config, SATURDAY, answers())
    expect(friday[0]?.fields.map((f) => f.metric.id)).toContain('velo')
    expect(saturday.flatMap((s) => s.fields).map((f) => f.metric.id)).not.toContain('velo')
  })

  it('never asks a quick-only metric in the daily flow', () => {
    const ids = buildDailyForm(config, FRIDAY, answers()).flatMap((s) => s.fields.map((f) => f.metric.id))
    expect(ids).not.toContain('urticaire')
  })

  it('hides inactive metrics', () => {
    const ids = buildDailyForm(config, FRIDAY, answers()).flatMap((s) => s.fields.map((f) => f.metric.id))
    expect(ids).not.toContain('inactif')
  })

  it('reveals follow-ups only once the parent is answered positively', () => {
    const hidden = buildDailyForm(config, FRIDAY, answers({ urticaire: false }))
    expect(hidden.flatMap((s) => s.fields).map((f) => f.metric.id)).not.toContain('intensite')

    const shown = buildDailyForm(config, FRIDAY, answers({ urticaire: true }))
    const ids = shown.flatMap((s) => s.fields).map((f) => f.metric.id)
    expect(ids).toContain('intensite')
    expect(ids).toContain('cause')
  })

  it('marks follow-ups with a depth so the UI can indent them', () => {
    const sections = buildDailyForm(config, FRIDAY, answers({ urticaire: true }))
    const fields = sections.flatMap((s) => s.fields)
    expect(fields.find((f) => f.metric.id === 'intensite')?.depth).toBe(1)
    expect(fields.find((f) => f.metric.id === 'sport')?.depth).toBe(0)
  })

  it('carries the current answer into each field', () => {
    const sections = buildDailyForm(config, FRIDAY, answers({ sport: true, energie: 'Bon' }))
    const fields = sections.flatMap((s) => s.fields)
    expect(fields.find((f) => f.metric.id === 'sport')?.value).toBe(true)
    expect(fields.find((f) => f.metric.id === 'energie')?.value).toBe('Bon')
    expect(fields.find((f) => f.metric.id === 'velo')?.value).toBeNull()
  })

  it('does not loop forever on a config cycle', () => {
    const cyclic: TrackerConfig = {
      tags: [],
      goals: [],
      metrics: [
        metric({ id: 'a', dependsOn: 'b' }),
        metric({ id: 'b', dependsOn: 'a' }),
      ],
    }
    expect(() => buildDailyForm(cyclic, FRIDAY, answers({ a: true, b: true }))).not.toThrow()
  })
})

describe('quick add', () => {
  it('lists only the rare events, not their follow-ups', () => {
    expect(quickAddMetrics(config).map((m) => m.id)).toEqual(['urticaire'])
  })

  it('returns the root alone until it is answered', () => {
    expect(buildQuickForm(config, answers(), 'urticaire').map((f) => f.metric.id)).toEqual(['urticaire'])
  })

  it('expands the whole follow-up chain once the root fires', () => {
    const fields = buildQuickForm(config, answers({ urticaire: true }), 'urticaire')
    expect(fields.map((f) => f.metric.id)).toEqual(['urticaire', 'intensite', 'cause'])
  })

  it('returns nothing for an unknown id', () => {
    expect(buildQuickForm(config, answers(), 'nope')).toEqual([])
  })
})

describe('formProgress', () => {
  it('counts answered fields, treating false as answered', () => {
    const sections = buildDailyForm(config, FRIDAY, answers({ velo: false, sport: true }))
    const progress = formProgress(sections)
    expect(progress.total).toBe(3)
    expect(progress.answered).toBe(2)
    expect(progress.ratio).toBeCloseTo(2 / 3)
  })

  it('reports a complete form when there is nothing to ask', () => {
    expect(formProgress([])).toEqual({ answered: 0, total: 0, ratio: 1 })
  })
})

describe('rare events recorded outside the daily flow', () => {
  it('shows a quick metric in the daily form once it has fired that day', () => {
    // Otherwise the intensity and cause questions would appear with nothing
    // above them explaining what they refer to.
    const sections = buildDailyForm(config, FRIDAY, answers({ urticaire: true }))
    const ids = sections.flatMap((s) => s.fields).map((f) => f.metric.id)
    expect(ids).toEqual(['velo', 'sport', 'energie', 'urticaire', 'intensite', 'cause'])
  })

  it('keeps it on screen when corrected to "Non", but hides its follow-ups', () => {
    // The row must not vanish under the user's finger mid-correction.
    const ids = buildDailyForm(config, FRIDAY, answers({ urticaire: false }))
      .flatMap((s) => s.fields)
      .map((f) => f.metric.id)
    expect(ids).toContain('urticaire')
    expect(ids).not.toContain('intensite')
  })

  it('hides it again only once the answer is cleared', () => {
    const ids = buildDailyForm(config, FRIDAY, answers({ urticaire: null }))
      .flatMap((s) => s.fields)
      .map((f) => f.metric.id)
    expect(ids).not.toContain('urticaire')
    expect(ids).not.toContain('intensite')
  })

  it('hides a follow-up whose parent has been deactivated', () => {
    const withInactiveParent: TrackerConfig = {
      tags: [],
      goals: [],
      metrics: [
        metric({ id: 'parent', active: false, mode: 'quick' }),
        metric({ id: 'child', dependsOn: 'parent' }),
      ],
    }
    const ids = buildDailyForm(withInactiveParent, FRIDAY, answers({ parent: true }))
      .flatMap((s) => s.fields)
      .map((f) => f.metric.id)
    expect(ids).toEqual([])
  })
})
