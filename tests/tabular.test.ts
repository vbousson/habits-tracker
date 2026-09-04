import { describe, expect, it } from 'vitest'
import {
  HEADERS, entryToRow, eventToRow, metricToRow, noteToRow,
  parseEntries, parseEvents, parseMetrics, parseNotes, parseTags, splitList,
} from '../src/core/tabular'
import { starterConfigRows, starterTagRows } from '../src/data/starter'

describe('splitList', () => {
  it('splits on the pipe and drops empties', () => {
    expect(splitList('a|b | c')).toEqual(['a', 'b', 'c'])
    expect(splitList('')).toEqual([])
    expect(splitList('a||b')).toEqual(['a', 'b'])
  })

  it('does not split on commas, which appear inside labels', () => {
    expect(splitList('Piscine, puis effort')).toEqual(['Piscine, puis effort'])
  })
})

describe('parseMetrics', () => {
  const header = [...HEADERS.config]

  it('reads columns by header name, not by position', () => {
    const reordered = ['label', 'id', 'type']
    const [m] = parseMetrics([reordered, ['Vélo', 'velo', 'bool']])
    expect(m?.id).toBe('velo')
    expect(m?.label).toBe('Vélo')
  })

  it('falls back to canonical order when the header is unrecognisable', () => {
    const [m] = parseMetrics([['', '', ''], ['velo', 'Vélo', 'bool']])
    expect(m?.id).toBe('velo')
    expect(m?.label).toBe('Vélo')
  })

  it('skips rows without an id', () => {
    expect(parseMetrics([header, ['', 'Orphan'], ['ok', 'Ok']])).toHaveLength(1)
  })

  it('treats a blank active cell as active', () => {
    const [m] = parseMetrics([header, ['velo', 'Vélo', 'bool']])
    expect(m?.active).toBe(true)
  })

  it('deactivates only on an explicit falsy value', () => {
    const rows = [header, ['a', 'A', 'bool', '', '', '', '', '', '', '', '', '', '', '', '', 'FALSE']]
    expect(parseMetrics(rows)[0]?.active).toBe(false)
  })

  it('defaults an unknown type to bool rather than throwing', () => {
    const [m] = parseMetrics([header, ['x', 'X', 'quantum']])
    expect(m?.type).toBe('bool')
  })

  it('sorts by order, then label', () => {
    const rows = [
      header,
      ['b', 'B', 'bool', '', '', '', '', '', '', '', '', '', '20'],
      ['a', 'A', 'bool', '', '', '', '', '', '', '', '', '', '10'],
    ]
    expect(parseMetrics(rows).map((m) => m.id)).toEqual(['a', 'b'])
  })

  it('keeps the sheet order when the order column is empty', () => {
    const rows = [header, ['z', 'Z'], ['a', 'A']]
    expect(parseMetrics(rows).map((m) => m.id)).toEqual(['z', 'a'])
  })

  it('round-trips a metric through metricToRow', () => {
    const original = parseMetrics(starterConfigRows())
    const roundTripped = parseMetrics([[...HEADERS.config], ...original.map(metricToRow)])
    expect(roundTripped).toEqual(original)
  })
})

describe('the starter template', () => {
  const metrics = parseMetrics(starterConfigRows())
  const tags = parseTags(starterTagRows())

  it('parses without loss', () => {
    expect(metrics.length).toBeGreaterThan(10)
    expect(tags.length).toBeGreaterThan(3)
  })

  it('uses unique metric ids', () => {
    expect(new Set(metrics.map((m) => m.id)).size).toBe(metrics.length)
  })

  it('only references tags that exist', () => {
    const known = new Set(tags.map((t) => t.id))
    for (const m of metrics) {
      for (const tag of m.tags) expect(known, `${m.id} → ${tag}`).toContain(tag)
    }
  })

  it('only depends on metrics that exist, with no cycles', () => {
    const byId = new Map(metrics.map((m) => [m.id, m]))
    for (const m of metrics) {
      if (!m.dependsOn) continue
      expect(byId.has(m.dependsOn), `${m.id} → ${m.dependsOn}`).toBe(true)
      const seen = new Set([m.id])
      let cursor = byId.get(m.dependsOn)
      while (cursor?.dependsOn) {
        expect(seen.has(cursor.id)).toBe(false)
        seen.add(cursor.id)
        cursor = byId.get(cursor.dependsOn)
      }
    }
  })

  it('gives every scale and choice metric its options', () => {
    for (const m of metrics) {
      if (m.type === 'scale' || m.type === 'choice') {
        expect(m.options.length, m.id).toBeGreaterThan(1)
      }
    }
  })

  it('exercises every field type, so the template doubles as a demo', () => {
    expect(new Set(metrics.map((m) => m.type))).toEqual(
      new Set(['bool', 'scale', 'choice', 'number', 'text']),
    )
  })
})

describe('entries, notes and events', () => {
  it('skips rows missing their key columns', () => {
    expect(parseEntries([[...HEADERS.entries], ['', 'velo', 'TRUE'], ['2026-01-01', '', 'TRUE']])).toHaveLength(0)
    expect(parseNotes([[...HEADERS.notes], ['', '2026-01-01']])).toHaveLength(0)
    expect(parseEvents([[...HEADERS.events], ['', '', '']])).toHaveLength(0)
  })

  it('defaults a one-day event to end === start', () => {
    const [e] = parseEvents([[...HEADERS.events], ['id', 'RDV', '2026-01-01', '', 'sante', '']])
    expect(e?.end).toBe('2026-01-01')
  })

  it('round-trips entries, notes and events', () => {
    const entry = { date: '2026-01-01', metricId: 'velo', value: true, updatedAt: 'now' }
    expect(parseEntries([[...HEADERS.entries], entryToRow(entry)])[0]).toEqual({
      ...entry,
      value: 'TRUE',
    })

    const note = { id: 'n1', date: '2026-01-01', tags: ['sante', 'sport'], text: 'Coucou', createdAt: 'now' }
    expect(parseNotes([[...HEADERS.notes], noteToRow(note)])[0]).toEqual(note)

    const event = { id: 'e1', label: 'Rush', start: '2026-01-01', end: '2026-01-08', tags: ['travail'], note: '' }
    expect(parseEvents([[...HEADERS.events], eventToRow(event)])[0]).toEqual(event)
  })
})
