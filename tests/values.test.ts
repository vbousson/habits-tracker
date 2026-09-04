import { describe, expect, it } from 'vitest'
import { formatValue, isTruthy, normalize, parseBoolean, parseValue, serializeValue } from '../src/core/values'
import { metric } from './helpers'

const bool = metric({ id: 'b', type: 'bool' })
const scale = metric({ id: 's', type: 'scale', options: ['Aucun', 'Léger', 'Modéré', 'Fort'] })
const choice = metric({ id: 'c', type: 'choice', options: ['A', 'B'] })
const num = metric({ id: 'n', type: 'number', min: 0, max: 100, unit: 'min' })
const text = metric({ id: 't', type: 'text' })

describe('parseBoolean', () => {
  it('accepts the spellings a spreadsheet actually contains', () => {
    for (const yes of ['TRUE', 'true', 'VRAI', 'oui', 'Oui', 'yes', '1', 'x']) {
      expect(parseBoolean(yes)).toBe(true)
    }
    for (const no of ['FALSE', 'faux', 'non', 'no', '0']) {
      expect(parseBoolean(no)).toBe(false)
    }
  })

  it('distinguishes empty from false', () => {
    expect(parseBoolean('')).toBeNull()
    expect(parseBoolean('   ')).toBeNull()
    expect(parseBoolean('peut-être')).toBeNull()
  })
})

describe('parseValue', () => {
  it('reads an empty cell as unanswered, never as a zero or a false', () => {
    for (const m of [bool, scale, choice, num, text]) expect(parseValue(m, '')).toBeNull()
  })

  it('accepts a comma decimal separator', () => {
    expect(parseValue(num, '42,5')).toBe(42.5)
    expect(parseValue(num, '42.5')).toBe(42.5)
    expect(parseValue(num, 'quarante')).toBeNull()
  })

  it('drops a scale label that is no longer in the options', () => {
    expect(parseValue(scale, 'Modéré')).toBe('Modéré')
    expect(parseValue(scale, 'Catastrophique')).toBeNull()
  })

  it('keeps any choice label, since the list is open in practice', () => {
    expect(parseValue(choice, 'Autre chose')).toBe('Autre chose')
  })
})

describe('serializeValue', () => {
  it('round-trips through parseValue', () => {
    expect(parseValue(bool, serializeValue(true))).toBe(true)
    expect(parseValue(bool, serializeValue(false))).toBe(false)
    expect(parseValue(num, serializeValue(12))).toBe(12)
    expect(parseValue(scale, serializeValue('Fort'))).toBe('Fort')
  })

  it('writes an unanswered value as an empty cell', () => {
    expect(serializeValue(null)).toBe('')
  })

  it('writes zero and false as real values, not as blanks', () => {
    expect(serializeValue(0)).toBe('0')
    expect(serializeValue(false)).toBe('FALSE')
  })
})

describe('isTruthy', () => {
  it('separates "answered no" from "not answered"', () => {
    expect(isTruthy(bool, true)).toBe(true)
    expect(isTruthy(bool, false)).toBe(false)
    expect(isTruthy(bool, null)).toBe(false)
  })

  it('treats the lowest level of a scale as falsy', () => {
    // "Aucun symptôme" is not an event, so it must not reveal a follow-up question.
    expect(isTruthy(scale, 'Aucun')).toBe(false)
    expect(isTruthy(scale, 'Léger')).toBe(true)
    expect(isTruthy(scale, 'Fort')).toBe(true)
  })

  it('treats zero as falsy for numbers', () => {
    expect(isTruthy(num, 0)).toBe(false)
    expect(isTruthy(num, 30)).toBe(true)
  })
})

describe('normalize', () => {
  it('maps booleans to the extremes', () => {
    expect(normalize(bool, true)).toBe(1)
    expect(normalize(bool, false)).toBe(0)
  })

  it('spreads scale levels evenly across 0..1', () => {
    expect(normalize(scale, 'Aucun')).toBe(0)
    expect(normalize(scale, 'Fort')).toBe(1)
    expect(normalize(scale, 'Léger')).toBeCloseTo(1 / 3)
  })

  it('clamps numbers into their declared bounds', () => {
    expect(normalize(num, 50)).toBe(0.5)
    expect(normalize(num, -10)).toBe(0)
    expect(normalize(num, 999)).toBe(1)
  })

  it('returns null for values with no meaningful order', () => {
    expect(normalize(choice, 'A')).toBeNull()
    expect(normalize(text, 'coucou')).toBeNull()
    expect(normalize(bool, null)).toBeNull()
  })

  it('does not divide by zero on a single-level scale', () => {
    expect(normalize(metric({ id: 'x', type: 'scale', options: ['Seul'] }), 'Seul')).toBe(1)
  })
})

describe('formatValue', () => {
  it('renders unanswered values as a dash', () => {
    expect(formatValue(bool, null)).toBe('—')
  })

  it('appends the unit for numbers', () => {
    expect(formatValue(num, 30)).toBe('30 min')
  })

  it('renders booleans in French', () => {
    expect(formatValue(bool, true)).toBe('Oui')
    expect(formatValue(bool, false)).toBe('Non')
  })
})
