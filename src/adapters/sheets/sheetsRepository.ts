/**
 * Google Sheets backend.
 *
 * Same rows as the local adapter, same parsing code from `core/tabular.ts` —
 * only the storage medium changes. Nothing here re-implements a `parseX` or an
 * `xToRow`: if the row layout ever moves, it moves in one place.
 *
 * ---------------------------------------------------------------------------
 * Write strategy, and its limits
 * ---------------------------------------------------------------------------
 * Every mutation is a read-modify-write of a whole tab, from the *cached* rows
 * loaded by `load()`, pushed back in a single `values:batchUpdate` anchored at
 * `A1`. Rows that disappear are overwritten with blanks in the same request
 * rather than through a separate `values:clear`, so there is never a moment
 * where the tab is half written.
 *
 * Why not something cleverer (targeted row updates, append-only with
 * compaction)? Because correctness is worth more here than cleverness: the
 * semantics then match `localRepository` line for line, which is the reference
 * implementation and the one covered by tests.
 *
 * What it costs: one request per save, carrying the whole tab. At ~4 columns
 * and ~40 characters per row, 1 000 entry rows ≈ 40 kB and 5 000 ≈ 200 kB per
 * save — noticeable on mobile data but still well inside Google's 10 MB request
 * limit and its 60 writes/minute/user quota (writes are debounced by
 * `useTracker`, so a burst of taps costs one request, not one per tap).
 * Past roughly 5 000 entry rows — about ten years of daily tracking with a dozen
 * metrics — this should become an append + periodic compaction scheme.
 *
 * The cache is what makes it viable: the sheet is fetched once per session, not
 * once per keystroke. The flip side is that a concurrent edit made in Google
 * Sheets (or on another device) during the session is overwritten on the next
 * save — last writer wins. Reloading the app re-syncs.
 */
import {
  entryToRow, eventToRow, metricToRow, noteToRow,
  parseEntries, parseEvents, parseMetrics, parseNotes, parseTags,
  HEADERS, SHEET,
} from '../../core/tabular'
import { typeEntries } from '../../core/repository'
import { batchGetValues, batchUpdateSpreadsheet, batchUpdateValues, getSpreadsheet, SheetsApiError } from './sheetsApi'
import type { HabitRepository } from '../../core/repository'
import type { Entry, ISODate, Metric, Note, Snapshot, TrackedEvent } from '../../core/types'

export interface SheetsRepositoryOptions {
  spreadsheetId: string
  /** Returns a valid OAuth access token, refreshing it if needed. */
  getAccessToken: () => Promise<string>
}

type TabKey = 'config' | 'tags' | 'entries' | 'notes' | 'events'

const TABS: Record<TabKey, { title: string; header: readonly string[] }> = {
  config: { title: SHEET.config, header: HEADERS.config },
  tags: { title: SHEET.tags, header: HEADERS.tags },
  entries: { title: SHEET.entries, header: HEADERS.entries },
  notes: { title: SHEET.notes, header: HEADERS.notes },
  events: { title: SHEET.events, header: HEADERS.events },
}

const TAB_KEYS: readonly TabKey[] = ['config', 'tags', 'entries', 'notes', 'events']

/**
 * A range that is just a tab title means "everything that tab contains", which
 * keeps working if the user adds a column — the parsers read by column name.
 */
const READ_RANGES: readonly string[] = [...TAB_KEYS.map((k) => TABS[k].title), SHEET.meta]

export function createSheetsRepository(options: SheetsRepositoryOptions): HabitRepository {
  const { spreadsheetId, getAccessToken } = options

  /** Raw rows, header included, exactly as they sit in the sheet. */
  const cache = new Map<TabKey, string[][]>()
  /** Rows currently holding data in the sheet, per tab — drives blank padding. */
  const extent = new Map<TabKey, number>()
  let loaded = false

  async function fetchAll(): Promise<Snapshot> {
    const token = await getAccessToken()
    // One round-trip for the whole spreadsheet. `Meta` is read along with the
    // rest so a future migration can inspect `schema_version` for free.
    const grids = await batchGetValues(token, spreadsheetId, READ_RANGES)

    TAB_KEYS.forEach((key, i) => {
      const rows = grids[i] ?? []
      cache.set(key, rows)
      extent.set(key, rows.length)
    })
    loaded = true

    const metrics = parseMetrics(cache.get('config') ?? [])
    return {
      config: { metrics, tags: parseTags(cache.get('tags') ?? []) },
      entries: typeEntries(parseEntries(cache.get('entries') ?? []), metrics),
      notes: parseNotes(cache.get('notes') ?? []),
      events: parseEvents(cache.get('events') ?? []),
    }
  }

  /** Read-modify-write one tab. `fn` receives the header and the body rows. */
  async function mutate(
    key: TabKey,
    fn: (header: readonly string[], body: string[][]) => string[][],
  ): Promise<void> {
    if (!loaded) await fetchAll()

    const tab = TABS[key]
    const rows = cache.get(key) ?? []
    // Mirrors every `parseX`: row 1 is the header, whatever it happens to hold.
    const header = rows[0] ?? [...tab.header]
    const next = [header, ...fn(header, rows.slice(1))]

    const previous = extent.get(key) ?? next.length
    const width = Math.max(tab.header.length, ...next.map((row) => row.length))
    const values = next.map((row) => padTo(row, width))
    for (let i = next.length; i < previous; i++) values.push(blankRow(width))

    const token = await getAccessToken()
    await writeValues(token, tab.title, values)

    cache.set(key, next)
    // Rows past `next.length` are blank now, so they no longer need clearing.
    extent.set(key, next.length)
  }

  /**
   * Write a block of rows at `A1`, growing the grid if the sheet is too short.
   *
   * `values.batchUpdate` does not extend a sheet: writing past the last row
   * fails with "exceeds grid limits". New spreadsheets are created roomy
   * (see `bootstrap.ts`), but a long-lived one — or one repaired by
   * `ensureSchema`, which uses Google's 1 000-row default — eventually needs
   * more room. Growing lazily, on the error, keeps the happy path at one
   * request.
   */
  async function writeValues(token: string, title: string, values: string[][]): Promise<void> {
    const data = [{ range: `${title}!A1`, values }]
    try {
      await batchUpdateValues(token, spreadsheetId, data)
    } catch (e) {
      if (!isGridLimitError(e)) throw e
      await growSheet(token, title, values.length)
      await batchUpdateValues(token, spreadsheetId, data)
    }
  }

  /** Add enough rows to hold `neededRows`, plus a comfortable margin. */
  async function growSheet(token: string, title: string, neededRows: number): Promise<void> {
    const resource = await getSpreadsheet(token, spreadsheetId)
    const target = resource.sheets?.find((s) => s.properties?.title === title)?.properties
    if (target?.sheetId === undefined) {
      throw new Error(`L'onglet « ${title} » est introuvable dans la feuille de calcul.`)
    }
    const current = target.gridProperties?.rowCount ?? 0
    const length = Math.max(neededRows + 1000 - current, 1000)
    await batchUpdateSpreadsheet(token, spreadsheetId, [
      { appendDimension: { sheetId: target.sheetId, dimension: 'ROWS', length } },
    ])
  }

  /** Replace every row whose `id` column matches, then append the new one. */
  function upsertById(key: TabKey, id: string, row: readonly string[]): Promise<void> {
    const canonical = TABS[key].header
    return mutate(key, (header, body) => {
      const at = columnIndex(header, canonical, 'id')
      return [...body.filter((r) => cellAt(r, at) !== id), alignRow(header, canonical, row)]
    })
  }

  function deleteById(key: TabKey, id: string): Promise<void> {
    const canonical = TABS[key].header
    return mutate(key, (header, body) => {
      const at = columnIndex(header, canonical, 'id')
      return body.filter((r) => cellAt(r, at) !== id)
    })
  }

  return {
    kind: 'sheets',
    label: 'Google Sheets',

    load: fetchAll,

    /**
     * Same rule as the local adapter: drop *every* row of that day, then write
     * the incoming ones. Replacement, not upsert — a metric the user cleared is
     * absent from `entries` and its row has to disappear, otherwise an answer
     * could never be un-answered.
     *
     * This is also why the write pads with blank rows (see `mutate`): a day
     * shrinking by one answer is the common case here, not an edge case.
     */
    saveDay(date: ISODate, entries: Entry[]): Promise<void> {
      return mutate('entries', (header, body) => {
        const dateAt = columnIndex(header, HEADERS.entries, 'date')
        const otherDays = body.filter((row) => cellAt(row, dateAt) !== date)
        return [...otherDays, ...entries.map((e) => alignRow(header, HEADERS.entries, entryToRow(e)))]
      })
    },

    saveNote: (note: Note) => upsertById('notes', note.id, noteToRow(note)),
    deleteNote: (id: string) => deleteById('notes', id),

    saveEvent: (event: TrackedEvent) => upsertById('events', event.id, eventToRow(event)),
    deleteEvent: (id: string) => deleteById('events', id),

    addMetric: (metric: Metric) => upsertById('config', metric.id, metricToRow(metric)),
  }
}

function isGridLimitError(e: unknown): boolean {
  return e instanceof SheetsApiError && e.status === 400 && /grid limits/i.test(e.message)
}

// --- Row helpers -------------------------------------------------------------

function padTo(row: readonly string[], width: number): string[] {
  const out = [...row]
  while (out.length < width) out.push('')
  return out
}

function blankRow(width: number): string[] {
  return new Array<string>(width).fill('')
}

function cellAt(row: readonly string[], index: number): string {
  if (index < 0) return ''
  return (row[index] ?? '').trim()
}

/**
 * Same rule as `reader()` in `core/tabular.ts`: a header row is trusted only if
 * it contains at least one canonical column name; otherwise column positions
 * fall back to the canonical order.
 */
function headerIsUsable(header: readonly string[], canonical: readonly string[]): boolean {
  const names = new Set(header.map((h) => h.trim().toLowerCase()))
  return canonical.some((name) => names.has(name))
}

function columnIndex(header: readonly string[], canonical: readonly string[], name: string): number {
  if (headerIsUsable(header, canonical)) {
    const at = header.findIndex((h) => h.trim().toLowerCase() === name)
    if (at >= 0) return at
  }
  return canonical.indexOf(name)
}

/**
 * Lay a canonical row out under the sheet's own header.
 *
 * A user is allowed to reorder the columns of their spreadsheet — the parsers
 * read by name — so a row we write must follow *their* order, not ours.
 */
function alignRow(
  header: readonly string[],
  canonical: readonly string[],
  values: readonly string[],
): string[] {
  if (!headerIsUsable(header, canonical)) return [...values]
  const out = blankRow(Math.max(header.length, canonical.length))
  const positions = new Map<string, number>()
  header.forEach((name, i) => {
    const key = name.trim().toLowerCase()
    if (key && !positions.has(key)) positions.set(key, i)
  })
  canonical.forEach((name, i) => {
    const at = positions.get(name) ?? i
    while (out.length <= at) out.push('')
    out[at] = values[i] ?? ''
  })
  return out
}
