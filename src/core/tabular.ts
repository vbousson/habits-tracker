/**
 * The canonical row layout of the tracker.
 *
 * Every backend that stores the data in a table — a Google Sheet, a CSV export,
 * the seed script — speaks this format. Keeping it here (rather than inside the
 * Sheets adapter) means the mapping is unit-testable without touching Google,
 * and that two backends can never drift apart.
 *
 * Parsing is driven by the *header names*, not by column position, so a user is
 * free to reorder or insert columns in their own spreadsheet.
 */
import { parseSchedule } from './schedule'
import { parseBoolean, serializeValue } from './values'
import type { Entry, Metric, MetricMode, MetricType, Note, Tag, TrackedEvent } from './types'

export const SHEET = {
  config: 'Config',
  tags: 'Tags',
  entries: 'Entries',
  notes: 'Notes',
  events: 'Events',
  meta: 'Meta',
} as const

export const HEADERS = {
  config: ['id', 'label', 'type', 'options', 'min', 'max', 'unit', 'tags', 'group', 'schedule', 'mode', 'depends_on', 'order', 'color', 'help', 'active'],
  tags: ['id', 'label', 'color'],
  entries: ['date', 'metric_id', 'value', 'updated_at'],
  notes: ['id', 'date', 'tags', 'text', 'created_at'],
  events: ['id', 'label', 'start', 'end', 'tags', 'note'],
  meta: ['key', 'value'],
} as const

/** Multi-valued cells (tags, scale levels) use `|` — labels often contain commas. */
export const LIST_SEPARATOR = '|'

export function splitList(raw: string): string[] {
  return raw
    .split(LIST_SEPARATOR)
    .map((s) => s.trim())
    .filter(Boolean)
}

export function joinList(values: readonly string[]): string {
  return values.join(LIST_SEPARATOR)
}

/**
 * Build a `(row, columnName) => cell` reader from a header row.
 * Unknown columns read as `''` so a sheet missing an optional column still loads.
 */
function reader(header: readonly string[], fallback: readonly string[]) {
  const index = new Map<string, number>()
  header.forEach((name, i) => {
    const key = name.trim().toLowerCase()
    if (key && !index.has(key)) index.set(key, i)
  })
  // A sheet with no recognisable header at all falls back to the canonical order.
  const usable = fallback.some((name) => index.has(name))
  return (row: readonly string[], name: string): string => {
    const i = usable ? index.get(name) : fallback.indexOf(name)
    if (i === undefined || i < 0) return ''
    return (row[i] ?? '').toString().trim()
  }
}

/** `[header, ...rows]` in, domain objects out. Blank and unparseable rows are skipped. */
export function parseMetrics(rows: readonly (readonly string[])[]): Metric[] {
  const [header = [], ...body] = rows
  const get = reader(header, HEADERS.config)
  const metrics: Metric[] = []
  body.forEach((row, i) => {
    const id = get(row, 'id')
    if (!id) return
    const min = Number(get(row, 'min'))
    const max = Number(get(row, 'max'))
    const order = Number(get(row, 'order'))
    const activeCell = get(row, 'active')
    metrics.push({
      id,
      label: get(row, 'label') || id,
      type: parseMetricType(get(row, 'type')),
      options: splitList(get(row, 'options')),
      min: Number.isFinite(min) && get(row, 'min') !== '' ? min : undefined,
      max: Number.isFinite(max) && get(row, 'max') !== '' ? max : undefined,
      unit: get(row, 'unit') || undefined,
      tags: splitList(get(row, 'tags')),
      group: get(row, 'group') || 'Divers',
      schedule: parseSchedule(get(row, 'schedule')),
      mode: parseMode(get(row, 'mode')),
      dependsOn: get(row, 'depends_on') || undefined,
      order: get(row, 'order') !== '' && Number.isFinite(order) ? order : i,
      color: get(row, 'color') || undefined,
      help: get(row, 'help') || undefined,
      // An empty `active` cell means active — users add rows without filling it.
      active: activeCell === '' ? true : parseBoolean(activeCell) !== false,
    })
  })
  return metrics.sort((a, b) => a.order - b.order || a.label.localeCompare(b.label))
}

const METRIC_TYPES: readonly MetricType[] = ['bool', 'scale', 'choice', 'number', 'text']

function parseMetricType(raw: string): MetricType {
  const s = raw.trim().toLowerCase()
  return (METRIC_TYPES as readonly string[]).includes(s) ? (s as MetricType) : 'bool'
}

function parseMode(raw: string): MetricMode {
  const s = raw.trim().toLowerCase()
  return s === 'quick' || s === 'both' ? s : 'daily'
}

export function metricToRow(m: Metric): string[] {
  return [
    m.id, m.label, m.type, joinList(m.options),
    m.min === undefined ? '' : String(m.min),
    m.max === undefined ? '' : String(m.max),
    m.unit ?? '', joinList(m.tags), m.group, m.schedule.raw, m.mode,
    m.dependsOn ?? '', String(m.order), m.color ?? '', m.help ?? '',
    m.active ? 'TRUE' : 'FALSE',
  ]
}

export function parseTags(rows: readonly (readonly string[])[]): Tag[] {
  const [header = [], ...body] = rows
  const get = reader(header, HEADERS.tags)
  return body
    .filter((row) => get(row, 'id'))
    .map((row) => ({
      id: get(row, 'id'),
      label: get(row, 'label') || get(row, 'id'),
      color: get(row, 'color') || '#8892a4',
    }))
}

export function tagToRow(t: Tag): string[] {
  return [t.id, t.label, t.color]
}

export function parseEntries(rows: readonly (readonly string[])[]): Entry[] {
  const [header = [], ...body] = rows
  const get = reader(header, HEADERS.entries)
  return body
    .filter((row) => get(row, 'date') && get(row, 'metric_id'))
    .map((row) => ({
      date: get(row, 'date'),
      metricId: get(row, 'metric_id'),
      // Kept as the raw cell here; `parseValue` needs the metric to type it,
      // which the repository applies once the config is known.
      value: get(row, 'value'),
      updatedAt: get(row, 'updated_at'),
    }))
}

export function entryToRow(e: Entry): string[] {
  return [e.date, e.metricId, serializeValue(e.value), e.updatedAt]
}

export function parseNotes(rows: readonly (readonly string[])[]): Note[] {
  const [header = [], ...body] = rows
  const get = reader(header, HEADERS.notes)
  return body
    .filter((row) => get(row, 'id') && get(row, 'date'))
    .map((row) => ({
      id: get(row, 'id'),
      date: get(row, 'date'),
      tags: splitList(get(row, 'tags')),
      text: get(row, 'text'),
      createdAt: get(row, 'created_at'),
    }))
}

export function noteToRow(n: Note): string[] {
  return [n.id, n.date, joinList(n.tags), n.text, n.createdAt]
}

export function parseEvents(rows: readonly (readonly string[])[]): TrackedEvent[] {
  const [header = [], ...body] = rows
  const get = reader(header, HEADERS.events)
  return body
    .filter((row) => get(row, 'id') && get(row, 'start'))
    .map((row) => {
      const start = get(row, 'start')
      return {
        id: get(row, 'id'),
        label: get(row, 'label'),
        start,
        end: get(row, 'end') || start,
        tags: splitList(get(row, 'tags')),
        note: get(row, 'note'),
      }
    })
}

export function eventToRow(e: TrackedEvent): string[] {
  return [e.id, e.label, e.start, e.end, joinList(e.tags), e.note]
}
