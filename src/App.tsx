import { useCallback, useEffect, useMemo, useState } from 'react'
import { createRepository } from './lib/backend'
import { applyTheme, loadSettings, saveSettings } from './lib/settings'
import { useTracker } from './lib/useTracker'
import { pushFacts, syncPushState } from './lib/push'
import { getAccessToken } from './lib/googleAuth'
import { buildDemoStore } from './data/demo'
import { createLocalRepository } from './adapters/local/localRepository'
import { DashboardScreen } from './ui/screens/DashboardScreen'
import { JournalScreen } from './ui/screens/JournalScreen'
import { SettingsScreen } from './ui/screens/SettingsScreen'
import { TodayScreen } from './ui/screens/TodayScreen'
import { IconChart, IconJournal, IconSettings, IconToday } from './ui/components/Icons'
import type { Settings } from './lib/settings'
import './ui/styles.css'

const SCREENS = ['today', 'dashboard', 'journal', 'settings'] as const
type Screen = (typeof SCREENS)[number]

const TABS: { id: Screen; label: string; title: string; Icon: typeof IconToday }[] = [
  { id: 'today', label: "Aujourd'hui", title: "Aujourd'hui", Icon: IconToday },
  { id: 'dashboard', label: 'Stats', title: 'Tableau de bord', Icon: IconChart },
  { id: 'journal', label: 'Journal', title: 'Journal', Icon: IconJournal },
  { id: 'settings', label: 'Réglages', title: 'Réglages', Icon: IconSettings },
]

function screenFromHash(): Screen {
  const raw = window.location.hash.replace(/^#\/?/, '')
  return (SCREENS as readonly string[]).includes(raw) ? (raw as Screen) : 'today'
}

export default function App() {
  const [settings, setSettings] = useState<Settings>(loadSettings)
  const [screen, setScreen] = useState<Screen>(screenFromHash)

  // The hash is the source of truth so the PWA restores the last screen, and so
  // back/forward behave the way a phone user expects.
  useEffect(() => {
    const sync = () => setScreen(screenFromHash())
    window.addEventListener('hashchange', sync)
    return () => window.removeEventListener('hashchange', sync)
  }, [])

  useEffect(() => {
    applyTheme(settings.theme)
  }, [settings.theme])

  const updateSettings = useCallback((next: Settings) => {
    setSettings(next)
    saveSettings(next)
  }, [])

  const navigate = useCallback((next: Screen) => {
    window.location.hash = `#/${next}`
    setScreen(next)
  }, [])

  // Rebuilding the repository reloads everything, so it must only depend on the
  // settings that actually change where the data lives.
  const repo = useMemo(
    () =>
      settings.backend === 'local'
        ? createLocalRepository('habits-tracker:local', buildDemoStore())
        : createRepository(settings),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [settings.backend, settings.spreadsheetId, settings.clientId],
  )

  const tracker = useTracker(repo)

  /**
   * Keep the reminder server's view of what is still unfilled up to date.
   *
   * It receives two derived numbers and nothing else — see the 2026-09 amendment
   * in `docs/adr/0002-reminders.md`. `syncPushState` debounces and drops
   * unchanged bodies, so running this on every snapshot change is cheap; doing
   * it here rather than only in Settings is what stops the evening reminder
   * firing on a day that was filled from another device.
   */
  const facts = useMemo(
    () => (tracker.snapshot ? pushFacts(tracker.snapshot.config, tracker.snapshot.entries) : null),
    [tracker.snapshot],
  )

  useEffect(() => {
    if (facts) syncPushState(() => getAccessToken(settings.clientId), settings, facts)
  }, [facts, settings])

  const active = TABS.find((t) => t.id === screen) ?? TABS[0]!

  return (
    <div className="app">
      <header className="app__header">
        <h1>{active.title}</h1>
        <SaveIndicator saving={tracker.saving} lastSavedAt={tracker.lastSavedAt} />
        {settings.backend === 'local' && (
          <span className="badge" title="Les données restent sur cet appareil">
            Démo
          </span>
        )}
      </header>

      <main className="app__main">
        {screen === 'today' && <TodayScreen tracker={tracker} />}
        {screen === 'dashboard' && <DashboardScreen tracker={tracker} />}
        {screen === 'journal' && <JournalScreen tracker={tracker} />}
        {screen === 'settings' && (
          <SettingsScreen tracker={tracker} settings={settings} onChange={updateSettings} />
        )}
      </main>

      <nav className="app__nav" aria-label="Navigation principale">
        <div className="app__nav-inner">
          {TABS.map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              className="navbtn"
              aria-current={screen === id ? 'page' : undefined}
              onClick={() => navigate(id)}
            >
              <Icon />
              <span>{label}</span>
            </button>
          ))}
        </div>
      </nav>
    </div>
  )
}

const CONFIRMATION_MS = 2200

function SaveIndicator({ saving, lastSavedAt }: { saving: boolean; lastSavedAt: number | null }) {
  // Which save has already been acknowledged on screen. Comparing two values is
  // pure, where reading the clock during render would not be.
  const [dismissed, setDismissed] = useState<number | null>(null)
  const recent = lastSavedAt !== null && lastSavedAt !== dismissed

  useEffect(() => {
    if (lastSavedAt === null) return
    const id = setTimeout(() => setDismissed(lastSavedAt), CONFIRMATION_MS)
    return () => clearTimeout(id)
  }, [lastSavedAt])

  if (saving) {
    return (
      <span className="row tiny faint" role="status">
        <span className="spinner" /> Enregistrement…
      </span>
    )
  }
  if (recent) {
    return (
      <span className="tiny faint" role="status">
        Enregistré
      </span>
    )
  }
  return null
}
