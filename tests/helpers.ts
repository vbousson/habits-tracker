import { parseSchedule } from '../src/core/schedule'
import type { Entry, Metric } from '../src/core/types'

export function metric(partial: Partial<Metric> & Pick<Metric, 'id'>): Metric {
  return {
    label: partial.id,
    type: 'bool',
    options: [],
    tags: [],
    group: 'Test',
    schedule: parseSchedule('daily'),
    mode: 'daily',
    order: 0,
    active: true,
    ...partial,
  }
}

export function entry(date: string, metricId: string, value: Entry['value']): Entry {
  return { date, metricId, value, updatedAt: `${date}T20:00:00.000Z` }
}
