import { describe, expect, it } from 'vitest'
import { catchUpState, describeGaps, findGaps } from '../src/core/catchup'
import { buildReminderCalendar, defaultReminderSlots, parseTimeOfDay } from '../src/lib/reminders'
import { parseSchedule } from '../src/core/schedule'
import { entry, metric } from './helpers'
import type { TrackerConfig } from '../src/core/types'

const daily = metric({ id: 'daily_one' })
const weekdayOnly = metric({ id: 'commute', schedule: parseSchedule('weekdays') })
const quick = metric({ id: 'flare', mode: 'quick', schedule: parseSchedule('never') })
const auto = metric({ id: 'duree', type: 'number', mode: 'auto' })

const config: TrackerConfig = { tags: [], goals: [], metrics: [daily, weekdayOnly, quick, auto] }

// 2026-08-31 is a Monday; 2026-09-05 a Saturday, 2026-09-06 a Sunday.
const WEEK = { from: '2026-08-31', to: '2026-09-06' }

describe('findGaps', () => {
  it('reports every expected day when nothing has been recorded', () => {
    expect(findGaps(config, [], WEEK).map((g) => g.date)).toEqual([
      '2026-08-31', '2026-09-01', '2026-09-02', '2026-09-03',
      '2026-09-04', '2026-09-05', '2026-09-06',
    ])
  })

  it('counts what is still missing, not what is present', () => {
    const [monday] = findGaps(config, [entry('2026-08-31', 'daily_one', true)], WEEK)
    // Monday owes two answers; one is in, so one is missing.
    expect(monday?.due).toBe(2)
    expect(monday?.missing).toBe(1)
    expect(monday?.untouched).toBe(false)
  })

  it('drops a day once everything due is answered', () => {
    const entries = [
      entry('2026-08-31', 'daily_one', true),
      entry('2026-08-31', 'commute', false),
    ]
    expect(findGaps(config, entries, WEEK).map((g) => g.date)).not.toContain('2026-08-31')
  })

  it('never asks for a quick-add or auto metric', () => {
    // Saturday owes only the daily metric: the commute is weekdays-only, the
    // flare-up is never asked, and the fill timer is written by the app.
    const saturday = findGaps(config, [], WEEK).find((g) => g.date === '2026-09-05')
    expect(saturday?.due).toBe(1)
  })

  it('is not a gap when nothing at all was due', () => {
    const weekendless: TrackerConfig = { tags: [], goals: [], metrics: [weekdayOnly] }
    expect(findGaps(weekendless, [], WEEK).map((g) => g.date)).toEqual([
      '2026-08-31', '2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04',
    ])
  })

  it('distinguishes an untouched day from a partial one', () => {
    const gaps = findGaps(config, [entry('2026-09-01', 'daily_one', true)], WEEK)
    expect(gaps.find((g) => g.date === '2026-08-31')?.untouched).toBe(true)
    expect(gaps.find((g) => g.date === '2026-09-01')?.untouched).toBe(false)
  })
})

describe('catchUpState', () => {
  it('singles out yesterday, which is what a morning reminder is for', () => {
    const state = catchUpState(config, [], 14, '2026-09-04')
    expect(state.yesterdayPending).toBe(true)
    expect(state.todayPending).toBe(true)
  })

  it('clears yesterday once it is complete', () => {
    const entries = [
      entry('2026-09-03', 'daily_one', true),
      entry('2026-09-03', 'commute', true),
    ]
    const state = catchUpState(config, entries, 14, '2026-09-04')
    expect(state.yesterdayPending).toBe(false)
  })

  it('does not look further back than asked', () => {
    const state = catchUpState(config, [], 3, '2026-09-04')
    expect(state.gaps.map((g) => g.date)).toEqual(['2026-09-02', '2026-09-03', '2026-09-04'])
  })
})

describe('describeGaps', () => {
  it('says nothing when there is nothing to say', () => {
    expect(describeGaps([], '2026-09-04')).toBeNull()
  })

  it('does not nag about the past when only today is open', () => {
    const gaps = findGaps(config, [], { from: '2026-09-04', to: '2026-09-04' })
    expect(describeGaps(gaps, '2026-09-04')).toContain("aujourd'hui")
  })

  it('names yesterday in the singular', () => {
    const gaps = findGaps(config, [], { from: '2026-09-03', to: '2026-09-03' })
    expect(describeGaps(gaps, '2026-09-04')).toContain('hier')
  })

  it('counts the days when several are open', () => {
    const gaps = findGaps(config, [], { from: '2026-09-01', to: '2026-09-03' })
    expect(describeGaps(gaps, '2026-09-04')).toBe('3 journées ne sont pas remplies.')
  })
})

describe('the reminder calendar', () => {
  it('parses only real times of day', () => {
    expect(parseTimeOfDay('21:30')).toBe(21 * 60 + 30)
    expect(parseTimeOfDay('7:20')).toBe(7 * 60 + 20)
    expect(parseTimeOfDay('')).toBeNull()
    expect(parseTimeOfDay('24:00')).toBeNull()
    expect(parseTimeOfDay('21:60')).toBeNull()
    expect(parseTimeOfDay('soir')).toBeNull()
  })

  it('writes one daily repeating event per configured slot', () => {
    const ics = buildReminderCalendar(
      defaultReminderSlots('21:30', '07:20', 'https://example.test/app/'),
      'https://example.test/app/',
      'Europe/Paris',
      new Date(2026, 8, 5, 12, 0, 0),
    )
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2)
    expect(ics).toContain('RRULE:FREQ=DAILY')
    // A wall-clock time with an explicit zone, so the reminder does not drift by
    // an hour when the clocks change.
    expect(ics).toContain('DTSTART;TZID=Europe/Paris:20260905T213000')
    expect(ics).toContain('DTSTART;TZID=Europe/Paris:20260905T072000')
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true)
  })

  it('omits a slot whose time is blank, which is how a reminder is turned off', () => {
    const ics = buildReminderCalendar(
      defaultReminderSlots('21:30', '', 'https://example.test/'),
      'https://example.test/',
      'Europe/Paris',
    )
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(1)
  })

  it('produces nothing but a valid empty calendar when both are off', () => {
    const ics = buildReminderCalendar([], 'https://example.test/', 'Europe/Paris')
    expect(ics).not.toContain('BEGIN:VEVENT')
    expect(ics).toContain('BEGIN:VCALENDAR')
  })

  it('escapes the characters iCalendar treats as syntax', () => {
    const ics = buildReminderCalendar(
      [{ time: '08:00', summary: 'Noter; vite, tout', description: 'a\nb' }],
      'https://example.test/',
      'Europe/Paris',
    )
    expect(ics).toContain('SUMMARY:Noter\\; vite\\, tout')
    expect(ics).toContain('DESCRIPTION:a\\nb')
  })

  it('uses CRLF line endings, which several calendars require', () => {
    const ics = buildReminderCalendar(
      defaultReminderSlots('21:30', '', 'https://example.test/'),
      'https://example.test/',
    )
    expect(ics.split('\r\n').length).toBeGreaterThan(10)
    expect(ics).not.toMatch(/[^\r]\n/)
  })
})
