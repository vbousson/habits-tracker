import { beforeEach, describe, expect, it } from 'vitest'
import { createLocalRepository } from '../src/adapters/local/localRepository'
import { buildDemoStore } from '../src/data/demo'
import { entry, metric } from './helpers'
import type { HabitRepository } from '../src/core/repository'

/**
 * A minimal in-memory `localStorage`, so the storage adapter is testable without
 * pulling in a whole DOM implementation as a dependency.
 */
function installStorage(): void {
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

describe('local repository', () => {
  let repo: HabitRepository

  beforeEach(() => {
    installStorage()
    repo = createLocalRepository('test')
  })

  it('starts from the starter template rather than an empty config', () => {
    return repo.load().then((snapshot) => {
      expect(snapshot.config.metrics.length).toBeGreaterThan(10)
      expect(snapshot.config.tags.length).toBeGreaterThan(3)
      expect(snapshot.entries).toEqual([])
    })
  })

  it('types entries against the config on the way out', async () => {
    await repo.saveDay('2026-09-04', [entry('2026-09-04', 'velo_travail', true)])
    const [saved] = (await repo.load()).entries
    // Stored as the string "TRUE", handed back as a real boolean.
    expect(saved?.value).toBe(true)
  })

  it('drops entries whose metric no longer exists', async () => {
    await repo.saveDay('2026-09-04', [entry('2026-09-04', 'metrique_supprimee', true)])
    expect((await repo.load()).entries).toEqual([])
  })

  it('upserts a day instead of appending duplicates', async () => {
    await repo.saveDay('2026-09-04', [entry('2026-09-04', 'velo_travail', true)])
    await repo.saveDay('2026-09-04', [entry('2026-09-04', 'velo_travail', false)])
    const entries = (await repo.load()).entries
    expect(entries).toHaveLength(1)
    expect(entries[0]?.value).toBe(false)
  })

  it('leaves other days untouched when saving one day', async () => {
    await repo.saveDay('2026-09-03', [entry('2026-09-03', 'velo_travail', true)])
    await repo.saveDay('2026-09-04', [entry('2026-09-04', 'velo_travail', false)])
    expect((await repo.load()).entries).toHaveLength(2)
  })

  it('removes an answer that is cleared', async () => {
    await repo.saveDay('2026-09-04', [entry('2026-09-04', 'velo_travail', true)])
    await repo.saveDay('2026-09-04', [])
    expect((await repo.load()).entries).toHaveLength(0)
  })

  it('round-trips notes and deletes them by id', async () => {
    const note = { id: 'n1', date: '2026-09-04', tags: ['sante'], text: 'Crise', createdAt: 'now' }
    await repo.saveNote(note)
    expect((await repo.load()).notes).toEqual([note])

    await repo.saveNote({ ...note, text: 'Crise légère' })
    const notes = (await repo.load()).notes
    expect(notes).toHaveLength(1)
    expect(notes[0]?.text).toBe('Crise légère')

    await repo.deleteNote('n1')
    expect((await repo.load()).notes).toEqual([])
  })

  it('round-trips events, including multi-day periods', async () => {
    const event = {
      id: 'e1', label: 'Rush', start: '2026-09-01', end: '2026-09-08',
      tags: ['travail'], note: 'Livraison',
    }
    await repo.saveEvent(event)
    expect((await repo.load()).events).toEqual([event])
    await repo.deleteEvent('e1')
    expect((await repo.load()).events).toEqual([])
  })

  it('adds a metric so a recurring note can be promoted to a real indicator', async () => {
    await repo.addMetric(metric({ id: 'nouvelle_metrique', label: 'Nouvelle', order: 999 }))
    const metrics = (await repo.load()).config.metrics
    expect(metrics.some((m) => m.id === 'nouvelle_metrique')).toBe(true)
  })

  it('survives a corrupted store instead of crashing the app', async () => {
    localStorage.setItem('test', '{ not json')
    expect((await createLocalRepository('test').load()).config.metrics.length).toBeGreaterThan(0)
  })

  it('seeds only when the store is empty, never over real data', async () => {
    await repo.saveDay('2026-09-04', [entry('2026-09-04', 'velo_travail', true)])
    const reopened = createLocalRepository('test', buildDemoStore())
    expect((await reopened.load()).entries).toHaveLength(1)
  })
})

describe('demo data', () => {
  beforeEach(installStorage)

  it('is deterministic, so the demo looks identical on every device', () => {
    const a = buildDemoStore()
    const b = buildDemoStore()
    expect(a.entries).toEqual(b.entries)
  })

  it('produces a history the dashboard can actually chart', async () => {
    const snapshot = await createLocalRepository('demo', buildDemoStore()).load()
    expect(snapshot.entries.length).toBeGreaterThan(500)
    expect(snapshot.notes.length).toBeGreaterThan(0)
    expect(snapshot.events.length).toBeGreaterThan(0)
    // Every generated entry must match a metric in the shipped config, otherwise
    // typeEntries would silently drop it and the demo would look half-empty.
    expect(snapshot.entries.every((e) => e.value !== null)).toBe(true)
  })

  it('leaves some days unrecorded, so the heatmap shows real gaps', async () => {
    const snapshot = await createLocalRepository('demo2', buildDemoStore()).load()
    const days = new Set(snapshot.entries.map((e) => e.date))
    expect(days.size).toBeLessThan(120)
    expect(days.size).toBeGreaterThan(90)
  })
})
