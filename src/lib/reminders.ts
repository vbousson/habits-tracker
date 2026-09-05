/**
 * Reminders, phase 1: a calendar file the user installs once.
 *
 * Why a `.ics` rather than a notification: a static site has no server, and
 * without a server the web platform cannot schedule anything. The Notification
 * Triggers API that would have allowed it was never shipped and its development
 * has officially ended; Periodic Background Sync cannot promise a time and does
 * not exist on iOS; and a page-side `setTimeout` requires the page to be open,
 * which defeats the purpose. The full analysis, with sources, is in
 * `docs/adr/0002-reminders.md`.
 *
 * A calendar subscription delivers the one thing that matters most — a prompt at
 * the right time, on every platform, with no permission prompt and nothing to
 * operate. What it cannot do is stay silent on a day already filled in; that
 * needs a push, which needs infrastructure. Being honest about the difference is
 * the point: an unconditional nag on a day you already logged is how a habit
 * tracker earns deletion.
 */

/** `HH:MM` → minutes since midnight, or `null` when the string is not a time. */
export function parseTimeOfDay(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim())
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours > 23 || minutes > 59) return null
  return hours * 60 + minutes
}

export interface ReminderSlot {
  /** `HH:MM` local time. */
  time: string
  summary: string
  description: string
}

function fold(line: string): string {
  // RFC 5545 caps a content line at 75 octets; longer lines continue with a
  // leading space. Calendars are unforgiving about this.
  const bytes = [...line]
  if (bytes.length <= 73) return line
  const chunks: string[] = []
  let current = ''
  for (const char of bytes) {
    if (current.length >= 73) {
      chunks.push(current)
      current = ' '
    }
    current += char
  }
  chunks.push(current)
  return chunks.join('\r\n')
}

function escapeText(value: string): string {
  // RFC 5545 §3.3.11: backslash, semicolon, comma and newline are syntax inside
  // a TEXT value and must be escaped. Note `'\;'` — `'\;'` is just `';'` in a
  // JavaScript string, which would silently emit an unescaped separator.
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n')
}

function stamp(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
  )
}

/**
 * A calendar file holding one daily repeating event per slot.
 *
 * The times are written as local wall-clock times with an explicit `TZID`, so a
 * reminder set for 21:30 stays at 21:30 across daylight-saving changes instead of
 * drifting by an hour twice a year.
 */
export function buildReminderCalendar(
  slots: ReminderSlot[],
  appUrl: string,
  timeZone: string = Intl.DateTimeFormat().resolvedOptions().timeZone,
  now: Date = new Date(),
): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  const start = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//MyHabits//reminders//FR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ]

  slots.forEach((slot, index) => {
    const minutes = parseTimeOfDay(slot.time)
    if (minutes === null) return
    const hhmm = `${pad(Math.floor(minutes / 60))}${pad(minutes % 60)}`
    lines.push(
      'BEGIN:VEVENT',
      `UID:myhabits-${index}-${hhmm}@local`,
      `DTSTAMP:${stamp(now)}`,
      `DTSTART;TZID=${timeZone}:${start}T${hhmm}00`,
      'DURATION:PT10M',
      'RRULE:FREQ=DAILY',
      `SUMMARY:${escapeText(slot.summary)}`,
      `DESCRIPTION:${escapeText(slot.description)}`,
      `URL:${escapeText(appUrl)}`,
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      'TRIGGER:-PT0M',
      `DESCRIPTION:${escapeText(slot.summary)}`,
      'END:VALARM',
      'END:VEVENT',
    )
  })

  lines.push('END:VCALENDAR')
  return lines.map(fold).join('\r\n') + '\r\n'
}

export function defaultReminderSlots(evening: string, morning: string, appUrl: string): ReminderSlot[] {
  const slots: ReminderSlot[] = []
  if (parseTimeOfDay(evening) !== null) {
    slots.push({
      time: evening,
      summary: 'Remplir la journée',
      description: `Deux minutes pour noter la journée qui se termine.\n${appUrl}`,
    })
  }
  if (parseTimeOfDay(morning) !== null) {
    slots.push({
      time: morning,
      summary: "Remplir la journée d'hier",
      description: `Si hier n'a pas été rempli, c'est le moment.\n${appUrl}`,
    })
  }
  return slots
}
