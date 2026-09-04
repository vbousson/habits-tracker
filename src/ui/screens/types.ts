import type { TrackerApi } from '../../lib/useTracker'
import type { Settings } from '../../lib/settings'

/** Every screen receives the same handle on the data layer. */
export interface ScreenProps {
  tracker: TrackerApi
}

export interface SettingsScreenProps extends ScreenProps {
  settings: Settings
  onChange: (settings: Settings) => void
}
