import type { Metric, MetricValue } from './types'

/** Spreadsheet cells are strings; these two functions are the only bridge. */

export function serializeValue(value: MetricValue): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE'
  return String(value)
}

const TRUTHY = new Set(['true', 'vrai', 'oui', 'yes', 'y', 'o', '1', 'x'])
const FALSY = new Set(['false', 'faux', 'non', 'no', 'n', '0'])

export function parseBoolean(raw: string): boolean | null {
  const s = raw.trim().toLowerCase()
  if (s === '') return null
  if (TRUTHY.has(s)) return true
  if (FALSY.has(s)) return false
  return null
}

export function parseValue(metric: Metric, raw: string): MetricValue {
  const s = raw.trim()
  if (s === '') return null
  switch (metric.type) {
    case 'bool':
      return parseBoolean(s)
    case 'number': {
      const n = Number(s.replace(',', '.'))
      return Number.isFinite(n) ? n : null
    }
    case 'scale':
      // Stored by label so the sheet stays readable even if the levels are
      // reordered later; unknown labels degrade to `null` rather than throwing.
      return metric.options.includes(s) ? s : null
    case 'choice':
      return s
    case 'text':
      return s
  }
}

/**
 * "Did something happen?" — drives dependent-metric visibility and the
 * "done / not done" reading of the dashboard.
 * For scales, the lowest level counts as falsy (Faible énergie ≠ an event).
 */
export function isTruthy(metric: Metric, value: MetricValue): boolean {
  if (value === null || value === '') return false
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value > 0
  if (metric.type === 'scale') return metric.options.indexOf(value) > 0
  return true
}

/**
 * Project a value onto 0..1 for colour scales and averages.
 * Returns `null` for values that have no meaningful order (choice, text).
 */
export function normalize(metric: Metric, value: MetricValue): number | null {
  if (value === null || value === '') return null
  switch (metric.type) {
    case 'bool':
      return value ? 1 : 0
    case 'scale': {
      const i = metric.options.indexOf(String(value))
      if (i < 0) return null
      return metric.options.length < 2 ? 1 : i / (metric.options.length - 1)
    }
    case 'number': {
      const n = Number(value)
      if (!Number.isFinite(n)) return null
      const min = metric.min ?? 0
      const max = metric.max ?? 0
      if (max <= min) return n > 0 ? 1 : 0
      return Math.min(1, Math.max(0, (n - min) / (max - min)))
    }
    default:
      return null
  }
}

/** Human-readable rendering, used in the form recap and the medical export. */
export function formatValue(metric: Metric, value: MetricValue): string {
  if (value === null || value === '') return '—'
  if (typeof value === 'boolean') return value ? 'Oui' : 'Non'
  if (metric.type === 'number') return metric.unit ? `${value} ${metric.unit}` : String(value)
  return String(value)
}
