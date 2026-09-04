import { createLocalRepository } from '../adapters/local/localRepository'
import { createSheetsRepository } from '../adapters/sheets/sheetsRepository'
import { getAccessToken } from './googleAuth'
import type { HabitRepository } from '../core/repository'
import type { Settings } from './settings'

/**
 * The single place that decides where data lives.
 *
 * Adding a REST backend later means adding one branch here and one file under
 * `src/adapters/` — nothing in `core/` or in the screens changes.
 */
export function createRepository(settings: Settings): HabitRepository {
  if (settings.backend === 'sheets' && settings.spreadsheetId && settings.clientId) {
    return createSheetsRepository({
      spreadsheetId: settings.spreadsheetId,
      getAccessToken: () => getAccessToken(settings.clientId),
    })
  }
  return createLocalRepository()
}
