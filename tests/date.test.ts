import { describe, expect, it } from 'vitest'
import {
  addDays, daysBetween, eachDay, fromISODate, isValidISODate,
  relativeDayLabel, startOfMonth, startOfWeek, toISODate, weekdayOf,
} from '../src/core/date'

describe('date helpers', () => {
  it('formats from local getters, not UTC', () => {
    // 23:30 local on the 1st must stay the 1st, even for a UTC+ offset where
    // toISOString() would already report the 2nd.
    expect(toISODate(new Date(2026, 0, 1, 23, 30))).toBe('2026-01-01')
    expect(toISODate(new Date(2026, 0, 1, 0, 30))).toBe('2026-01-01')
  })

  it('round-trips through fromISODate', () => {
    for (const iso of ['2026-01-01', '2026-02-28', '2024-02-29', '2026-12-31']) {
      expect(toISODate(fromISODate(iso))).toBe(iso)
    }
  })

  it('crosses month and year boundaries', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
    expect(addDays('2024-03-01', -1)).toBe('2024-02-29')
  })

  it('survives a spring-forward DST transition', () => {
    // In Europe/Paris the clocks jump on 2026-03-29; a naive +24h would skip a day.
    expect(addDays('2026-03-28', 1)).toBe('2026-03-29')
    expect(addDays('2026-03-29', 1)).toBe('2026-03-30')
    expect(daysBetween('2026-03-28', '2026-03-30')).toBe(2)
  })

  it('validates ISO dates including impossible ones', () => {
    expect(isValidISODate('2026-01-01')).toBe(true)
    expect(isValidISODate('2026-02-30')).toBe(false)
    expect(isValidISODate('2026-13-01')).toBe(false)
    expect(isValidISODate('26-01-01')).toBe(false)
    expect(isValidISODate('')).toBe(false)
  })

  it('enumerates inclusive ranges and refuses inverted ones', () => {
    expect(eachDay({ from: '2026-01-01', to: '2026-01-03' })).toEqual([
      '2026-01-01', '2026-01-02', '2026-01-03',
    ])
    expect(eachDay({ from: '2026-01-03', to: '2026-01-01' })).toEqual([])
    expect(eachDay({ from: '2026-01-01', to: '2026-01-01' })).toHaveLength(1)
  })

  it('starts weeks on Monday', () => {
    // 2026-09-04 is a Friday.
    expect(weekdayOf('2026-09-04')).toBe(5)
    expect(startOfWeek('2026-09-04')).toBe('2026-08-31')
    // Sunday belongs to the week that started the previous Monday.
    expect(startOfWeek('2026-09-06')).toBe('2026-08-31')
    expect(startOfWeek('2026-09-07')).toBe('2026-09-07')
  })

  it('starts months on the first', () => {
    expect(startOfMonth('2026-09-30')).toBe('2026-09-01')
  })

  it('labels days relative to a reference', () => {
    expect(relativeDayLabel('2026-09-04', '2026-09-04')).toBe("aujourd'hui")
    expect(relativeDayLabel('2026-09-03', '2026-09-04')).toBe('hier')
    expect(relativeDayLabel('2026-09-05', '2026-09-04')).toBe('demain')
    expect(relativeDayLabel('2026-08-30', '2026-09-04')).toContain('30')
  })
})
