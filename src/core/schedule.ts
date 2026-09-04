import type { Schedule } from './types'
import { weekdayOf } from './date'
import type { ISODate } from './types'

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6]

/** Accepts French and English day names, plus the three named presets. */
const DAY_ALIASES: Record<string, number> = {
  sun: 0, dim: 0, dimanche: 0, sunday: 0,
  mon: 1, lun: 1, lundi: 1, monday: 1,
  tue: 2, mar: 2, mardi: 2, tuesday: 2,
  wed: 3, mer: 3, mercredi: 3, wednesday: 3,
  thu: 4, jeu: 4, jeudi: 4, thursday: 4,
  fri: 5, ven: 5, vendredi: 5, friday: 5,
  sat: 6, sam: 6, samedi: 6, saturday: 6,
}

/**
 * Parse a `schedule` cell.
 *
 * Accepted: `daily` (default), `weekdays`, `weekends`, `never`,
 * or an explicit list such as `mon,wed,fri` / `lun,mer,ven`.
 * Anything unrecognised falls back to `daily` — a mistyped cell should not
 * make a metric silently disappear from the form.
 */
export function parseSchedule(raw: string): Schedule {
  const s = raw.trim().toLowerCase()
  if (s === '' || s === 'daily' || s === 'quotidien' || s === 'tous') {
    return { days: ALL_DAYS, raw: raw.trim() || 'daily' }
  }
  if (s === 'weekdays' || s === 'semaine' || s === 'ouvres' || s === 'ouvrés') {
    return { days: [1, 2, 3, 4, 5], raw: raw.trim() }
  }
  if (s === 'weekends' || s === 'weekend' || s === 'we') {
    return { days: [0, 6], raw: raw.trim() }
  }
  if (s === 'never' || s === 'jamais') {
    return { days: [], raw: raw.trim() }
  }
  const days = s
    .split(/[,;/ ]+/)
    .map((token) => DAY_ALIASES[token])
    .filter((d): d is number => d !== undefined)
  if (days.length === 0) return { days: ALL_DAYS, raw: raw.trim() || 'daily' }
  return { days: [...new Set(days)].sort(), raw: raw.trim() }
}

export function isDueOn(schedule: Schedule, date: ISODate): boolean {
  return schedule.days.includes(weekdayOf(date))
}
