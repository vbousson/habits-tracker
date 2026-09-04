/**
 * Whole-screen smoke tests.
 *
 * These render every screen to static markup in each of its states. They are not
 * a substitute for using the app, but they catch the failure that unit tests
 * structurally cannot: a screen that throws on an empty snapshot, on a missing
 * config, or while an error banner is up. Those are exactly the states nobody
 * exercises by hand, and exactly the ones a new user hits first.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { DashboardScreen } from '../src/ui/screens/DashboardScreen'
import { JournalScreen } from '../src/ui/screens/JournalScreen'
import { SettingsScreen } from '../src/ui/screens/SettingsScreen'
import { TodayScreen } from '../src/ui/screens/TodayScreen'
import { parseMetrics, parseTags } from '../src/core/tabular'
import { starterConfigRows, starterTagRows } from '../src/data/starter'
import { typeEntries } from '../src/core/repository'
import { buildDemoStore } from '../src/data/demo'
import { parseEntries, parseEvents, parseNotes } from '../src/core/tabular'
import { defaultSettings } from '../src/lib/settings'
import type { Snapshot } from '../src/core/types'
import type { TrackerApi } from '../src/lib/useTracker'

beforeAll(() => {
  // `document` is only touched by portals, which stay closed here, but the
  // settings module reads storage at import time in some paths.
  const data = new Map<string, string>()
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
      removeItem: (k: string) => void data.delete(k),
      clear: () => data.clear(),
      key: () => null,
      length: 0,
    },
  })
})

const metrics = parseMetrics(starterConfigRows())
const tags = parseTags(starterTagRows())

function demoSnapshot(): Snapshot {
  const store = buildDemoStore()
  return {
    config: { metrics, tags },
    entries: typeEntries(parseEntries(store.entries), metrics),
    notes: parseNotes(store.notes),
    events: parseEvents(store.events),
  }
}

const EMPTY: Snapshot = { config: { metrics, tags }, entries: [], notes: [], events: [] }
const NO_CONFIG: Snapshot = { config: { metrics: [], tags: [] }, entries: [], notes: [], events: [] }

function tracker(over: Partial<TrackerApi> = {}): TrackerApi {
  return {
    status: 'ready',
    error: null,
    snapshot: demoSnapshot(),
    saving: false,
    lastSavedAt: null,
    repo: { kind: 'local', label: 'Cet appareil' },
    reload: async () => {},
    answersFor: () => new Map(),
    setValue: () => {},
    flush: async () => {},
    saveNote: async () => {},
    deleteNote: async () => {},
    saveEvent: async () => {},
    deleteEvent: async () => {},
    addMetric: async () => {},
    ...over,
  } as unknown as TrackerApi
}

const SCREENS = [
  ['Aujourd’hui', (t: TrackerApi) => <TodayScreen tracker={t} />],
  ['Tableau de bord', (t: TrackerApi) => <DashboardScreen tracker={t} />],
  ['Journal', (t: TrackerApi) => <JournalScreen tracker={t} />],
  [
    'Réglages',
    (t: TrackerApi) => <SettingsScreen tracker={t} settings={defaultSettings()} onChange={() => {}} />,
  ],
] as const

describe.each(SCREENS)('%s', (_name, render) => {
  it('renders with a full history', () => {
    expect(renderToStaticMarkup(render(tracker()))).not.toBe('')
  })

  it('renders while loading, before any snapshot exists', () => {
    expect(() =>
      renderToStaticMarkup(render(tracker({ status: 'loading', snapshot: null }))),
    ).not.toThrow()
  })

  it('renders an error without a snapshot', () => {
    const html = renderToStaticMarkup(
      render(tracker({ status: 'error', snapshot: null, error: 'Session expirée' })),
    )
    expect(html).not.toBe('')
  })

  it('renders an error while a stale snapshot is still on screen', () => {
    expect(() =>
      renderToStaticMarkup(render(tracker({ status: 'error', error: 'Réseau indisponible' }))),
    ).not.toThrow()
  })

  it('renders a brand-new, empty tracker', () => {
    expect(() => renderToStaticMarkup(render(tracker({ snapshot: EMPTY })))).not.toThrow()
  })

  it('renders when the spreadsheet defines no metrics at all', () => {
    expect(() => renderToStaticMarkup(render(tracker({ snapshot: NO_CONFIG })))).not.toThrow()
  })

  it('renders while saving', () => {
    expect(() => renderToStaticMarkup(render(tracker({ saving: true })))).not.toThrow()
  })
})

describe('the screens say something useful in their empty states', () => {
  it('points a user with no configured metrics at the settings screen', () => {
    const html = renderToStaticMarkup(<TodayScreen tracker={tracker({ snapshot: NO_CONFIG })} />)
    expect(html.toLowerCase()).toContain('églage')
  })

  it('invites a first entry rather than drawing an empty chart', () => {
    const html = renderToStaticMarkup(<DashboardScreen tracker={tracker({ snapshot: EMPTY })} />)
    expect(html).not.toContain('NaN')
    expect(html).not.toContain('undefined')
  })

  it('never renders NaN or undefined with real data', () => {
    for (const [, render] of SCREENS) {
      const html = renderToStaticMarkup(render(tracker()))
      expect(html).not.toContain('NaN')
      expect(html).not.toContain('>undefined<')
    }
  })
})
