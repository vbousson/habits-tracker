import type { DateRange, ISODate } from './types'

/**
 * Dates are handled as `YYYY-MM-DD` strings in *local* time throughout the app.
 * Going through `Date.toISOString()` would silently shift the day for anyone
 * east or west of UTC, so we format from the local getters instead.
 */
export function toISODate(d: Date): ISODate {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function fromISODate(iso: ISODate): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1)
}

export function todayISO(): ISODate {
  return toISODate(new Date())
}

export function addDays(iso: ISODate, days: number): ISODate {
  const d = fromISODate(iso)
  d.setDate(d.getDate() + days)
  return toISODate(d)
}

/** 0 = Sunday … 6 = Saturday, matching `Date.getDay()`. */
export function weekdayOf(iso: ISODate): number {
  return fromISODate(iso).getDay()
}

export function isValidISODate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  return toISODate(fromISODate(value)) === value
}

/** Inclusive on both ends. Returns `[]` when the range is inverted. */
export function eachDay(range: DateRange): ISODate[] {
  const out: ISODate[] = []
  for (let d = range.from; d <= range.to; d = addDays(d, 1)) out.push(d)
  return out
}

export function daysBetween(from: ISODate, to: ISODate): number {
  const ms = fromISODate(to).getTime() - fromISODate(from).getTime()
  return Math.round(ms / 86_400_000)
}

/** Monday-based, matching the French week. */
export function startOfWeek(iso: ISODate): ISODate {
  const shift = (weekdayOf(iso) + 6) % 7
  return addDays(iso, -shift)
}

export function startOfMonth(iso: ISODate): ISODate {
  return `${iso.slice(0, 7)}-01`
}

export function lastNDays(n: number, end: ISODate = todayISO()): DateRange {
  return { from: addDays(end, -(n - 1)), to: end }
}

export function inRange(iso: ISODate, range: DateRange): boolean {
  return iso >= range.from && iso <= range.to
}

const DAY_LABELS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.']
const MONTH_LABELS = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
]

export function formatDayLong(iso: ISODate): string {
  const d = fromISODate(iso)
  return `${DAY_LABELS[d.getDay()]} ${d.getDate()} ${MONTH_LABELS[d.getMonth()]}`
}

export function formatDayShort(iso: ISODate): string {
  const d = fromISODate(iso)
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function formatMonth(iso: ISODate): string {
  const d = fromISODate(iso)
  return `${MONTH_LABELS[d.getMonth()]} ${d.getFullYear()}`
}

/** "aujourd'hui" / "hier" / a plain date, for headers. */
export function relativeDayLabel(iso: ISODate, today: ISODate = todayISO()): string {
  const delta = daysBetween(today, iso)
  if (delta === 0) return "aujourd'hui"
  if (delta === -1) return 'hier'
  if (delta === 1) return 'demain'
  return formatDayLong(iso)
}
