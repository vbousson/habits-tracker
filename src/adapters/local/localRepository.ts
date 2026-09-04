/**
 * On-device backend.
 *
 * Stores exactly the same rows a Google Sheet would hold, in `localStorage`.
 * That symmetry is deliberate: the demo exercises the very same parsing and
 * serialisation code as the real backend, so a bug in the tabular mapping shows
 * up offline instead of in production. It also gives the public deployment
 * something to show without asking a visitor to sign into Google.
 */
import {
  entryToRow, eventToRow, goalToRow, metricToRow, noteToRow,
  parseEntries, parseEvents, parseGoals, parseMetrics, parseNotes, parseTags,
  HEADERS,
} from '../../core/tabular'
import { typeEntries } from '../../core/repository'
import { starterConfigRows, starterTagRows } from '../../data/starter'
import { starterGoalRows } from '../../data/starterGoals'
import type { HabitRepository } from '../../core/repository'
import type { Entry, Goal, ISODate, Metric, Note, Snapshot, TrackedEvent } from '../../core/types'

export interface LocalStore {
  config: string[][]
  tags: string[][]
  entries: string[][]
  notes: string[][]
  events: string[][]
  goals: string[][]
}

export function emptyStore(): LocalStore {
  return {
    config: starterConfigRows(),
    tags: starterTagRows(),
    entries: [[...HEADERS.entries]],
    notes: [[...HEADERS.notes]],
    events: [[...HEADERS.events]],
    goals: starterGoalRows(),
  }
}

function read(key: string): LocalStore {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return emptyStore()
    const parsed = JSON.parse(raw) as Partial<LocalStore>
    const base = emptyStore()
    return {
      config: parsed.config?.length ? parsed.config : base.config,
      tags: parsed.tags?.length ? parsed.tags : base.tags,
      entries: parsed.entries ?? base.entries,
      notes: parsed.notes ?? base.notes,
      events: parsed.events ?? base.events,
      goals: parsed.goals?.length ? parsed.goals : base.goals,
    }
  } catch {
    // A corrupted or unavailable store must not brick the app.
    return emptyStore()
  }
}

function write(key: string, store: LocalStore): void {
  try {
    localStorage.setItem(key, JSON.stringify(store))
  } catch {
    // Private browsing and quota errors are non-fatal: the session keeps working,
    // it simply will not survive a reload.
  }
}

export function createLocalRepository(
  key = 'habits-tracker:local',
  seed?: LocalStore,
): HabitRepository {
  if (seed && !localStorage.getItem(key)) write(key, seed)

  const mutate = (fn: (store: LocalStore) => void): Promise<void> => {
    const store = read(key)
    fn(store)
    write(key, store)
    return Promise.resolve()
  }

  return {
    kind: 'local',
    label: 'Cet appareil',

    load(): Promise<Snapshot> {
      const store = read(key)
      const metrics = parseMetrics(store.config)
      return Promise.resolve({
        config: { metrics, tags: parseTags(store.tags), goals: parseGoals(store.goals) },
        entries: typeEntries(parseEntries(store.entries), metrics),
        notes: parseNotes(store.notes),
        events: parseEvents(store.events),
      })
    },

    saveDay(date: ISODate, entries: Entry[]): Promise<void> {
      return mutate((store) => {
        const [header = [...HEADERS.entries], ...body] = store.entries
        // Drop the whole day, then write it back: an answer the user cleared is
        // absent from `entries` and must disappear from storage too.
        const otherDays = body.filter((row) => row[0] !== date)
        store.entries = [header, ...otherDays, ...entries.map(entryToRow)]
      })
    },

    saveNote(note: Note): Promise<void> {
      return mutate((store) => {
        const [header = [...HEADERS.notes], ...body] = store.notes
        store.notes = [header, ...body.filter((r) => r[0] !== note.id), noteToRow(note)]
      })
    },

    deleteNote(id: string): Promise<void> {
      return mutate((store) => {
        const [header = [...HEADERS.notes], ...body] = store.notes
        store.notes = [header, ...body.filter((r) => r[0] !== id)]
      })
    },

    saveEvent(event: TrackedEvent): Promise<void> {
      return mutate((store) => {
        const [header = [...HEADERS.events], ...body] = store.events
        store.events = [header, ...body.filter((r) => r[0] !== event.id), eventToRow(event)]
      })
    },

    deleteEvent(id: string): Promise<void> {
      return mutate((store) => {
        const [header = [...HEADERS.events], ...body] = store.events
        store.events = [header, ...body.filter((r) => r[0] !== id)]
      })
    },

    addMetric(metric: Metric): Promise<void> {
      return mutate((store) => {
        const [header = [...HEADERS.config], ...body] = store.config
        store.config = [header, ...body.filter((r) => r[0] !== metric.id), metricToRow(metric)]
      })
    },

    saveGoal(goal: Goal): Promise<void> {
      return mutate((store) => {
        const [header = [...HEADERS.goals], ...body] = store.goals
        store.goals = [header, ...body.filter((r) => r[0] !== goal.id), goalToRow(goal)]
      })
    },

    deleteGoal(id: string): Promise<void> {
      return mutate((store) => {
        const [header = [...HEADERS.goals], ...body] = store.goals
        store.goals = [header, ...body.filter((r) => r[0] !== id)]
      })
    },
  }
}
