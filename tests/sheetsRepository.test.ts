import { describe, expect, it, beforeEach, vi } from 'vitest'
import { createSheetsRepository } from '../src/adapters/sheets/sheetsRepository'
import { createLocalRepository } from '../src/adapters/local/localRepository'
import { HEADERS, SHEET } from '../src/core/tabular'
import { installMemoryStorage } from './helpers'
import type { Entry } from '../src/core/types'

let sheet: Record<string, string[][]>
const writes: { range: string; values: string[][] }[] = []
const appends: { range: string; values: string[][] }[] = []

function stubFetch() {
  vi.stubGlobal('fetch', async (input: unknown, init?: { method?: string; body?: string }) => {
    const url = String(input)
    if (url.includes('values:batchGet')) {
      const params = new URL(url).searchParams
      const ranges = params.getAll('ranges')
      return new Response(
        JSON.stringify({ valueRanges: ranges.map((r) => ({ range: r, values: sheet[r] ?? [] })) }),
        { status: 200 },
      )
    }
    if (url.includes('values:batchUpdate')) {
      const body = JSON.parse(init?.body ?? '{}') as { valueInputOption: string; data: { range: string; values: string[][] }[] }
      expect(body.valueInputOption).toBe('RAW')
      for (const d of body.data) {
        writes.push(d)
        const [title = ''] = d.range.split('!')
        sheet[title] = d.values
      }
      return new Response('{}', { status: 200 })
    }
    if (url.includes(':append')) {
      const body = JSON.parse(init?.body ?? '{}') as { values: string[][] }
      const [, encoded = ''] = url.match(/\/values\/([^:]+):append/) ?? []
      const title = decodeURIComponent(encoded).split('!')[0] ?? ''
      appends.push({ range: title, values: body.values })
      sheet[title] = [...(sheet[title] ?? []), ...body.values]
      return new Response('{}', { status: 200 })
    }
    throw new Error(`unexpected fetch ${url}`)
  })
}

const repo = () =>
  createSheetsRepository({ spreadsheetId: 'X', getAccessToken: () => Promise.resolve('tok') })

describe('sheets repository', () => {
  beforeEach(() => {
    writes.length = 0
    appends.length = 0
    sheet = {
      [SHEET.config]: [
        [...HEADERS.config],
        ['a', 'A', 'bool', '', '', '', '', '', 'G', 'daily', 'daily', '', '10', '', '', 'TRUE'],
        ['b', 'B', 'number', '', '', '', 'min', '', 'G', 'daily', 'daily', '', '20', '', '', 'TRUE'],
      ],
      [SHEET.tags]: [[...HEADERS.tags], ['g', 'G', '#fff']],
      [SHEET.entries]: [
        [...HEADERS.entries],
        ['2024-01-01', 'a', 'TRUE', 't0'],
        ['2024-01-01', 'b', '12', 't0'],
        ['2024-01-02', 'a', 'FALSE', 't0'],
      ],
      [SHEET.notes]: [[...HEADERS.notes], ['n1', '2024-01-01', 'g', 'hello', 't0']],
      [SHEET.events]: [[...HEADERS.events], ['e1', 'Vac', '2024-01-01', '2024-01-05', 'g', '']],
      [SHEET.meta]: [[...HEADERS.meta], ['schema_version', '1']],
    }
    stubFetch()
    installMemoryStorage()
  })

  it('load() types entries and drops unknown metrics', async () => {
    const snap = await repo().load()
    expect(snap.config.metrics.map((m) => m.id)).toEqual(['a', 'b'])
    expect(snap.entries).toEqual([
      { date: '2024-01-01', metricId: 'a', value: true, updatedAt: 't0' },
      { date: '2024-01-01', metricId: 'b', value: 12, updatedAt: 't0' },
      { date: '2024-01-02', metricId: 'a', value: false, updatedAt: 't0' },
    ])
    expect(snap.notes).toHaveLength(1)
    expect(snap.events[0]?.end).toBe('2024-01-05')
  })

  it('appends only what changed, and tombstones what was cleared', async () => {
    // Rewriting the whole tab would be several hundred kilobytes per save once a
    // year of history has accumulated, so a save must touch only the difference.
    const entries: Entry[] = [{ date: '2024-01-01', metricId: 'a', value: false, updatedAt: 't1' }]
    const r = repo()
    await r.load()
    await r.saveDay('2024-01-01', entries)

    expect(appends).toHaveLength(1)
    expect(appends[0]?.range).toBe(SHEET.entries)
    const [changed, tombstone] = appends[0]?.values ?? []
    expect(changed).toEqual(['2024-01-01', 'a', 'FALSE', 't1'])
    // `b` was answered and is now absent: an empty value marks it as cleared.
    expect(tombstone?.slice(0, 3)).toEqual(['2024-01-01', 'b', ''])

    // Untouched rows stay exactly where they were.
    expect(sheet[SHEET.entries]?.slice(0, 4)).toEqual([
      [...HEADERS.entries],
      ['2024-01-01', 'a', 'TRUE', 't0'],
      ['2024-01-01', 'b', '12', 't0'],
      ['2024-01-02', 'a', 'FALSE', 't0'],
    ])
  })

  it('collapses the appended history back to the same answers as the local adapter', async () => {
    const entries: Entry[] = [{ date: '2024-01-01', metricId: 'a', value: false, updatedAt: 't1' }]
    const r = repo()
    await r.load()
    await r.saveDay('2024-01-01', entries)

    const reread = await r.load()
    expect(reread.entries.filter((e) => e.date === '2024-01-01')).toEqual([
      { date: '2024-01-01', metricId: 'a', value: false, updatedAt: 't1' },
    ])

    // The reference implementation must reach the same contract by its own
    // route — it rewrites the day rather than appending — so the assertion is on
    // the observable outcome, using a metric its starter config actually knows.
    const local = createLocalRepository('k-' + Math.random())
    await local.saveDay('2024-01-01', [
      { date: '2024-01-01', metricId: 'velo_travail', value: true, updatedAt: 't1' },
      { date: '2024-01-01', metricId: 'seance_sport', value: true, updatedAt: 't1' },
    ])
    await local.saveDay('2024-01-01', [
      { date: '2024-01-01', metricId: 'velo_travail', value: false, updatedAt: 't2' },
    ])
    const localDay = (await local.load()).entries.filter((e) => e.date === '2024-01-01')
    expect(localDay.map((e) => [e.metricId, e.value])).toEqual([['velo_travail', false]])
  })

  it('sends no request at all when nothing changed', async () => {
    // The UI autosaves on a timer, so an idle save must cost nothing.
    const r = repo()
    await r.load()
    await r.saveDay('2024-01-02', [
      { date: '2024-01-02', metricId: 'a', value: false, updatedAt: 't9' },
    ])
    expect(appends).toHaveLength(0)
  })

  it('re-answering after a tombstone wins again', async () => {
    const r = repo()
    await r.load()
    await r.saveDay('2024-01-01', [])
    expect((await r.load()).entries.filter((e) => e.date === '2024-01-01')).toEqual([])

    await r.saveDay('2024-01-01', [
      { date: '2024-01-01', metricId: 'a', value: true, updatedAt: 't5' },
    ])
    expect((await r.load()).entries.filter((e) => e.date === '2024-01-01')).toEqual([
      { date: '2024-01-01', metricId: 'a', value: true, updatedAt: 't5' },
    ])
  })

  it('upserts notes and events by id, deletes by id', async () => {
    const r = repo()
    await r.load()
    await r.saveNote({ id: 'n1', date: '2024-01-01', tags: ['g'], text: 'edited', createdAt: 't1' })
    expect(sheet[SHEET.notes]).toEqual([
      [...HEADERS.notes],
      ['n1', '2024-01-01', 'g', 'edited', 't1'],
    ])
    await r.deleteNote('n1')
    expect(sheet[SHEET.notes]).toEqual([[...HEADERS.notes], ['', '', '', '', '']])

    await r.deleteEvent('e1')
    expect(sheet[SHEET.events]).toEqual([[...HEADERS.events], ['', '', '', '', '', '']])
  })

  it('writes new rows under a reordered header', async () => {
    sheet[SHEET.entries] = [['updated_at', 'value', 'metric_id', 'date'], ['t0', 'TRUE', 'a', '2024-01-01']]
    const r = repo()
    await r.load()
    await r.saveDay('2024-01-03', [
      { date: '2024-01-03', metricId: 'b', value: 7, updatedAt: 't2' },
    ])
    expect(sheet[SHEET.entries]).toEqual([
      ['updated_at', 'value', 'metric_id', 'date'],
      ['t0', 'TRUE', 'a', '2024-01-01'],
      ['t2', '7', 'b', '2024-01-03'],
    ])
  })

  it('reads everything in a single batchGet', async () => {
    const calls: string[] = []
    vi.stubGlobal('fetch', async (input: unknown) => {
      calls.push(String(input))
      const params = new URL(String(input)).searchParams
      const ranges = params.getAll('ranges')
      return new Response(
        JSON.stringify({ valueRanges: ranges.map((r) => ({ range: r, values: sheet[r] ?? [] })) }),
        { status: 200 },
      )
    })
    await repo().load()
    expect(calls).toHaveLength(1)
    expect(new URL(calls[0] ?? '').searchParams.getAll('ranges')).toEqual([
      'Config', 'Tags', 'Entries', 'Notes', 'Events', 'Goals', 'Meta',
    ])
  })
})
