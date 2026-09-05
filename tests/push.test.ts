/**
 * The reminder decision, tested where it is pure.
 *
 * Nothing here touches the network, a service worker or a browser. That is only
 * possible because the decision lives in `server/decide.js` — a module with no
 * I/O whose entire input is (state, instant, window) — and because the client's
 * two derived facts come out of `pushFacts`, which is a projection of
 * `core/catchup`. Both are imported directly.
 *
 * `server/decide.js` is plain Node ESM with a hand-written `.d.ts` beside it;
 * see the comment at the top of that declaration file for why.
 */
import { describe, expect, it } from 'vitest'
import { addDays, decide, isDeadSubscription, markSent, parseHhMm, zonedNow } from '../server/decide.js'
import { pushFacts, urlBase64ToUint8Array } from '../src/lib/push'
import { entry, metric } from './helpers'
import type { ReminderState } from '../server/decide.js'
import type { TrackerConfig } from '../src/core/types'

// --- The key the browser needs ----------------------------------------------

describe('urlBase64ToUint8Array', () => {
  it('decodes a padded standard-alphabet string', () => {
    // "hello" -> aGVsbG8=
    expect([...urlBase64ToUint8Array('aGVsbG8=')]).toEqual([104, 101, 108, 108, 111])
  })

  it('restores the padding base64url drops', () => {
    // "hell" -> aGVsbA==, which base64url writes as aGVsbA
    expect([...urlBase64ToUint8Array('aGVsbA')]).toEqual([104, 101, 108, 108])
  })

  it('maps the two swapped characters back', () => {
    // 0xFB 0xFF 0xBF is "+/+/" territory: base64 "+/+/", base64url "-_-_".
    const standard = [...urlBase64ToUint8Array('+/+/')]
    expect([...urlBase64ToUint8Array('-_-_')]).toEqual(standard)
    expect(standard).toEqual([251, 255, 191])
  })

  it('produces the 65 bytes a real VAPID public key decodes to', () => {
    // An uncompressed P-256 point: 0x04 plus two 32-byte coordinates.
    const key = 'B' + 'A'.repeat(86)
    expect(urlBase64ToUint8Array(key)).toHaveLength(65)
  })
})

// --- Time zones and the calendar --------------------------------------------

describe('zonedNow', () => {
  it('resolves an instant into the user local date and minute', () => {
    // 19:30 UTC on 5 September 2026 is 21:30 in Paris (CEST, UTC+2).
    const at = zonedNow(new Date('2026-09-05T19:30:00Z'), 'Europe/Paris')
    expect(at).toEqual({ date: '2026-09-05', minute: 21 * 60 + 30 })
  })

  it('crosses midnight into the next local day, at minute zero not 1440', () => {
    // 22:00 UTC is 00:00 the next day in Paris. Some ICU builds render that hour
    // as "24"; if the modulo were missing this would be 1440 and every slot
    // comparison would silently fall out of range.
    const at = zonedNow(new Date('2026-09-05T22:00:00Z'), 'Europe/Paris')
    expect(at).toEqual({ date: '2026-09-06', minute: 0 })
  })

  it('follows a daylight-saving change without the client re-registering', () => {
    // The last Sunday of October 2026: Paris goes back to UTC+1 at 03:00 local.
    const before = zonedNow(new Date('2026-10-24T19:30:00Z'), 'Europe/Paris')
    const after = zonedNow(new Date('2026-10-26T19:30:00Z'), 'Europe/Paris')
    expect(before.minute).toBe(21 * 60 + 30)
    expect(after.minute).toBe(20 * 60 + 30)
  })

  it('gives a different local date to the same instant in two zones', () => {
    const instant = new Date('2026-09-05T23:30:00Z')
    expect(zonedNow(instant, 'Europe/Paris').date).toBe('2026-09-06')
    expect(zonedNow(instant, 'America/New_York').date).toBe('2026-09-05')
  })
})

describe('addDays', () => {
  it('steps back across a month boundary', () => {
    expect(addDays('2026-09-01', -1)).toBe('2026-08-31')
  })

  it('steps across a leap day', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
  })
})

describe('parseHhMm', () => {
  it('accepts a time and rejects everything else', () => {
    expect(parseHhMm('07:20')).toBe(440)
    expect(parseHhMm('21:30')).toBe(1290)
    expect(parseHhMm('00:00')).toBe(0)
    // An empty string is how a slot is switched off in Settings.
    expect(parseHhMm('')).toBeNull()
    expect(parseHhMm('24:00')).toBeNull()
    expect(parseHhMm('21:60')).toBeNull()
    expect(parseHhMm(undefined)).toBeNull()
  })
})

// --- The decision -----------------------------------------------------------

const BASE: ReminderState = {
  subscription: { endpoint: 'https://push.example/abc' },
  times: { evening: '21:30', morning: '07:20' },
  tz: 'Europe/Paris',
  lastFilled: '2026-09-04',
  pendingDays: 0,
}

/**
 * A Paris wall-clock time, as the instant the cron would fire.
 *
 * September is CEST, so UTC+2, written out rather than computed: a helper that
 * used the code under test to find the offset would prove nothing. `Date.UTC`
 * rolls a negative hour back into the previous day, which is what makes the
 * midnight cases below expressible.
 */
function paris(date: string, time: string): Date {
  const [hours, minutes] = time.split(':').map(Number)
  const [year, month, day] = date.split('-').map(Number)
  return new Date(Date.UTC(year!, month! - 1, day!, hours! - 2, minutes!))
}

describe('decide — the slot window', () => {
  it('fires on the tick that lands exactly on the configured minute', () => {
    const decision = decide(BASE, paris('2026-09-05', '21:30'))
    expect(decision?.slot).toBe('evening')
    expect(decision?.date).toBe('2026-09-05')
  })

  it('stays quiet on the tick before and the tick after', () => {
    expect(decide(BASE, paris('2026-09-05', '21:25'))).toBeNull()
    expect(decide(BASE, paris('2026-09-05', '21:35'))).toBeNull()
  })

  it('fires once when the time sits between two five-minute ticks', () => {
    const odd = { ...BASE, times: { evening: '21:32', morning: '07:20' } }
    // 21:30 is before the window; 21:35 is inside [21:32, 21:37).
    expect(decide(odd, paris('2026-09-05', '21:30'))).toBeNull()
    expect(decide(odd, paris('2026-09-05', '21:35'))?.slot).toBe('evening')
    expect(decide(odd, paris('2026-09-05', '21:40'))).toBeNull()
  })

  it('never matches a slot whose time is empty', () => {
    const eveningOnly = { ...BASE, times: { evening: '21:30', morning: '' } }
    expect(decide(eveningOnly, paris('2026-09-05', '07:20'))).toBeNull()
  })

  it('respects the window width it is given', () => {
    expect(decide(BASE, paris('2026-09-05', '21:40'), 15)?.slot).toBe('evening')
    expect(decide(BASE, paris('2026-09-05', '21:45'), 15)).toBeNull()
  })
})

describe('decide — a */5 cron cannot double-fire', () => {
  it('goes quiet for the rest of the day once the send is recorded', () => {
    const first = decide(BASE, paris('2026-09-05', '21:30'))
    expect(first).not.toBeNull()

    const after = markSent(BASE, first!.slot, first!.date)
    // A retried, delayed or duplicated tick inside the same window.
    expect(decide(after, paris('2026-09-05', '21:30'))).toBeNull()
    expect(decide(after, paris('2026-09-05', '21:34'))).toBeNull()
  })

  it('is armed again the next day', () => {
    const after = markSent(BASE, 'evening', '2026-09-05')
    const next = decide(after, paris('2026-09-06', '21:30'))
    expect(next?.slot).toBe('evening')
    expect(next?.date).toBe('2026-09-06')
  })

  it('keeps the two slots independent', () => {
    // The evening of the 5th was sent; the morning of the 6th is a different
    // slot and a different date, and must still fire.
    const after = markSent({ ...BASE, lastFilled: '2026-09-04' }, 'evening', '2026-09-05')
    expect(decide(after, paris('2026-09-06', '07:20'))?.slot).toBe('morning')
  })
})

describe('decide — is a reminder warranted', () => {
  const evening = (lastFilled: string) =>
    decide({ ...BASE, lastFilled }, paris('2026-09-05', '21:30'))
  const morning = (lastFilled: string) =>
    decide({ ...BASE, lastFilled }, paris('2026-09-05', '07:20'))

  it('evening: fires while the day that is ending is unfilled', () => {
    expect(evening('2026-09-04')?.slot).toBe('evening')
    expect(evening('2026-08-20')?.slot).toBe('evening')
  })

  it('evening: silent the moment today is filled', () => {
    expect(evening('2026-09-05')).toBeNull()
  })

  it('morning: silent when yesterday is filled, even if today is not', () => {
    // The whole point of the morning slot: at 07:20 today is obviously empty,
    // and nagging about it would make the reminder worthless.
    expect(morning('2026-09-04')).toBeNull()
  })

  it('morning: fires when yesterday was missed', () => {
    expect(morning('2026-09-03')?.slot).toBe('morning')
  })

  it('treats a never-filled tracker as warranting both', () => {
    const fresh: ReminderState = { ...BASE, lastFilled: undefined }
    expect(decide(fresh, paris('2026-09-05', '21:30'))?.slot).toBe('evening')
    expect(decide(fresh, paris('2026-09-05', '07:20'))?.slot).toBe('morning')
  })

  it('names the situation in French, with the pending count', () => {
    const one = decide({ ...BASE, lastFilled: '2026-09-03', pendingDays: 1 }, paris('2026-09-05', '07:20'))
    expect(one?.payload.body).toBe("Hier n'est pas rempli.")

    const three = decide({ ...BASE, lastFilled: '2026-09-01', pendingDays: 3 }, paris('2026-09-05', '07:20'))
    expect(three?.payload.body).toBe('3 journées en attente.')

    const tonight = decide({ ...BASE, lastFilled: '2026-09-04', pendingDays: 0 }, paris('2026-09-05', '21:30'))
    expect(tonight?.payload.body).toBe("La journée qui se termine n'est pas remplie.")
  })

  it('never puts anything but a slot name and a French sentence in the payload', () => {
    const decision = decide(BASE, paris('2026-09-05', '21:30'))
    expect(Object.keys(decision!.payload).sort()).toEqual(['body', 'slot', 'title'])
  })
})

describe('decide — the midnight boundary', () => {
  const lateNight: ReminderState = { ...BASE, times: { evening: '00:00', morning: '07:20' } }

  it('fires at the first minute of the new local day, for the new day', () => {
    const decision = decide(lateNight, paris('2026-09-06', '00:00'))
    expect(decision?.slot).toBe('evening')
    // The date is the *new* day: `lastFilled` 2026-09-04 is behind 2026-09-06.
    expect(decision?.date).toBe('2026-09-06')
  })

  it('does not leak the previous day into the same window', () => {
    // 23:55 the night before is not in [00:00, 00:05) of anything.
    expect(decide(lateNight, paris('2026-09-05', '23:55'))).toBeNull()
  })
})

// --- Dead subscriptions ------------------------------------------------------

describe('isDeadSubscription', () => {
  it('recognises the two codes that mean "this endpoint is gone"', () => {
    expect(isDeadSubscription(404)).toBe(true)
    expect(isDeadSubscription(410)).toBe(true)
  })

  it('leaves every other failure to be retried or raised', () => {
    // 429 and 5xx are transient; 401/403 mean the VAPID setup is wrong, which is
    // a bug to see in the logs, not a subscription to silently drop.
    for (const code of [400, 401, 403, 413, 429, 500, 503]) {
      expect(isDeadSubscription(code)).toBe(false)
    }
    expect(isDeadSubscription(undefined)).toBe(false)
  })
})

// --- The two facts the client derives ---------------------------------------

describe('pushFacts', () => {
  const config: TrackerConfig = { tags: [], goals: [], metrics: [metric({ id: 'daily_one' })] }

  it('reports nothing owed when the whole window is answered', () => {
    const entries = ['2026-09-03', '2026-09-04', '2026-09-05'].map((d) => entry(d, 'daily_one', true))
    expect(pushFacts(config, entries, '2026-09-05', 3)).toEqual({
      lastFilled: '2026-09-05',
      pendingDays: 0,
    })
  })

  it('counts past unfilled days but never today', () => {
    // Nothing at all recorded: today is unfilled (so lastFilled is behind it)
    // and the 13 days before it are the pending ones.
    const facts = pushFacts(config, [], '2026-09-05')
    expect(facts.lastFilled).toBe('2026-08-22')
    expect(facts.pendingDays).toBe(13)
  })

  it('walks back to the most recent filled day', () => {
    // A four-day window, 2 September to 5 September, with only the 2nd answered.
    const entries = [entry('2026-09-02', 'daily_one', true)]
    const facts = pushFacts(config, entries, '2026-09-05', 4)
    expect(facts.lastFilled).toBe('2026-09-02')
    // The 3rd and the 4th. Today is unfilled too, but it is not "pending" — it
    // is what `lastFilled < today` already tells the evening slot.
    expect(facts.pendingDays).toBe(2)
  })

  it('feeds a state the server then judges the way the user would', () => {
    // Yesterday filled, today not: the evening reminder is due, the morning one
    // is not. This is the round trip the whole feature exists for.
    const facts = pushFacts(config, [entry('2026-09-04', 'daily_one', true)], '2026-09-05', 2)
    const state: ReminderState = { ...BASE, ...facts }
    expect(decide(state, paris('2026-09-05', '21:30'))?.slot).toBe('evening')
    expect(decide(state, paris('2026-09-05', '07:20'))).toBeNull()
  })
})
