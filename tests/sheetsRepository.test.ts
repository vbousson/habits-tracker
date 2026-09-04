import { describe, expect, it, beforeEach, vi } from 'vitest'
import { createSheetsRepository } from '../src/adapters/sheets/sheetsRepository'
import { createLocalRepository } from '../src/adapters/local/localRepository'
import { HEADERS, SHEET } from '../src/core/tabular'
import type { Entry } from '../src/core/types'

let sheet: Record<string, string[][]>
const writes: { range: string; values: string[][] }[] = []

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
    throw new Error(`unexpected fetch ${url}`)
  })
}

const repo = () =>
  createSheetsRepository({ spreadsheetId: 'X', getAccessToken: () => Promise.resolve('tok') })

describe('sheets repository', () => {
  beforeEach(() => {
    writes.length = 0
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

  it('saveDay replaces the whole day, exactly like the local adapter', async () => {
    const entries: Entry[] = [{ date: '2024-01-01', metricId: 'a', value: false, updatedAt: 't1' }]
    const r = repo()
    await r.load()
    await r.saveDay('2024-01-01', entries)

    // The cleared metric `b` must be gone, and the removed row blanked out.
    expect(sheet[SHEET.entries]).toEqual([
      [...HEADERS.entries],
      ['2024-01-02', 'a', 'FALSE', 't0'],
      ['2024-01-01', 'a', 'FALSE', 't1'],
      ['', '', '', ''],
    ])

    // Same logical result as the reference implementation.
    const local = createLocalRepository('k-' + Math.random())
    await local.saveDay('2024-01-01', entries)
    const before = (await r.load()).entries
    expect(before.filter((e) => e.date === '2024-01-01')).toEqual([
      { date: '2024-01-01', metricId: 'a', value: false, updatedAt: 't1' },
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
      'Config', 'Tags', 'Entries', 'Notes', 'Events', 'Meta',
    ])
  })
})
