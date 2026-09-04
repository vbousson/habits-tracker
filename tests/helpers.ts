import { parseSchedule } from '../src/core/schedule'
import type { Entry, Metric } from '../src/core/types'

export function metric(partial: Partial<Metric> & Pick<Metric, 'id'>): Metric {
  return {
    label: partial.id,
    type: 'bool',
    options: [],
    colors: [],
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

/**
 * A minimal in-memory `localStorage`, so the storage-backed code is testable
 * without pulling a whole DOM implementation in as a dependency.
 *
 * Worth knowing: `localRepository` deliberately swallows storage errors so that
 * private browsing cannot brick the app. The consequence for tests is that
 * forgetting this stub does not raise — writes simply vanish — so any test that
 * touches the local backend must call it.
 */
export function installMemoryStorage(): void {
  const data = new Map<string, string>()
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
      removeItem: (k: string) => void data.delete(k),
      clear: () => data.clear(),
      key: (i: number) => [...data.keys()][i] ?? null,
      get length() {
        return data.size
      },
    },
  })
}
