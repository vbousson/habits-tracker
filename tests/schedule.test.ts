import { describe, expect, it } from 'vitest'
import { isDueOn, parseSchedule } from '../src/core/schedule'

describe('parseSchedule', () => {
  it('treats an empty cell as daily', () => {
    expect(parseSchedule('').days).toHaveLength(7)
    expect(parseSchedule('').raw).toBe('daily')
  })

  it('understands the named presets in French and English', () => {
    expect(parseSchedule('weekdays').days).toEqual([1, 2, 3, 4, 5])
    expect(parseSchedule('semaine').days).toEqual([1, 2, 3, 4, 5])
    expect(parseSchedule('weekends').days).toEqual([0, 6])
    expect(parseSchedule('never').days).toEqual([])
    expect(parseSchedule('jamais').days).toEqual([])
  })

  it('parses explicit day lists in either language, deduplicated and sorted', () => {
    expect(parseSchedule('mon,wed,fri').days).toEqual([1, 3, 5])
    expect(parseSchedule('lun, mer, ven').days).toEqual([1, 3, 5])
    expect(parseSchedule('ven/lun/ven').days).toEqual([1, 5])
  })

  it('falls back to daily rather than hiding a mistyped metric', () => {
    // A typo in the spreadsheet must not make a question silently vanish.
    expect(parseSchedule('lundu').days).toHaveLength(7)
    expect(parseSchedule('¯\\_(ツ)_/¯').days).toHaveLength(7)
  })

  it('keeps the original cell for round-tripping', () => {
    expect(parseSchedule(' weekdays ').raw).toBe('weekdays')
  })
})

describe('isDueOn', () => {
  it('matches the weekday of the date', () => {
    const weekdays = parseSchedule('weekdays')
    expect(isDueOn(weekdays, '2026-09-04')).toBe(true) // Friday
    expect(isDueOn(weekdays, '2026-09-05')).toBe(false) // Saturday
    expect(isDueOn(parseSchedule('weekends'), '2026-09-05')).toBe(true)
    expect(isDueOn(parseSchedule('never'), '2026-09-05')).toBe(false)
  })
})
