/**
 * User-level preferences, persisted on the device.
 *
 * The Google client id can be baked in at build time (`VITE_GOOGLE_CLIENT_ID`)
 * *and* overridden here at runtime. Forks that deploy their own instance set the
 * build variable once; anyone using a shared deployment can point the app at
 * their own Google Cloud project without rebuilding it.
 */
export type BackendChoice = 'local' | 'sheets'
export type ThemeChoice = 'system' | 'light' | 'dark'

export interface Settings {
  backend: BackendChoice
  spreadsheetId: string
  clientId: string
  theme: ThemeChoice
  /** Set once the local demo data has been generated, so it is only seeded once. */
  demoSeeded: boolean
  /**
   * Reminder times as `HH:MM` local, or `''` to disable one.
   *
   * They feed two things: the calendar file offered in Settings, and — when
   * `pushEnabled` — the reminder service, which stores them alongside the
   * device's time zone. See `docs/adr/0002-reminders.md`.
   */
  reminderEvening: string
  reminderMorning: string
  /**
   * Whether this device has opted into push reminders.
   *
   * The browser's subscription is the real truth (`getPushState` reads it), but
   * that read is asynchronous and goes through the service worker. This flag is
   * the synchronous answer to "should we bother posting freshness updates?",
   * asked on every snapshot change.
   */
  pushEnabled: boolean
}

const KEY = 'habits-tracker:settings'

const BUILT_IN_CLIENT_ID = (import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '').trim()

export function defaultSettings(): Settings {
  return {
    backend: 'local',
    spreadsheetId: '',
    clientId: BUILT_IN_CLIENT_ID,
    theme: 'system',
    demoSeeded: false,
    reminderEvening: '21:30',
    reminderMorning: '07:20',
    pushEnabled: false,
  }
}

export function loadSettings(): Settings {
  const base = defaultSettings()
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return base
    const stored = JSON.parse(raw) as Partial<Settings>
    return {
      ...base,
      ...stored,
      // An empty stored value must not shadow a client id supplied at build time.
      clientId: (stored.clientId ?? '').trim() || base.clientId,
    }
  } catch {
    return base
  }
}

export function saveSettings(settings: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings))
  } catch {
    // Non-fatal: preferences simply will not survive a reload.
  }
}

export function applyTheme(theme: ThemeChoice): void {
  const root = document.documentElement
  if (theme === 'system') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', theme)
}
