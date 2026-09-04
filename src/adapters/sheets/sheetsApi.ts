/**
 * A minimal Google Sheets / Drive REST client.
 *
 * No SDK, no `gapi`, no generated types: five endpoints and `fetch`. Everything
 * here is stateless — the caller supplies a fresh bearer token per call, which
 * keeps token refreshing entirely inside `src/lib/googleAuth.ts`.
 *
 * Every failure is turned into a French `SheetsApiError` carrying the HTTP
 * status, so the UI can display something actionable instead of "500".
 */

const SHEETS_BASE = 'https://sheets.googleapis.com/v4/spreadsheets'

/** Supplied by the repository; returns a valid OAuth access token. */
export type TokenProvider = () => Promise<string>

export class SheetsApiError extends Error {
  readonly status: number
  readonly reason: string

  constructor(message: string, status: number, reason = '') {
    super(message)
    this.name = 'SheetsApiError'
    this.status = status
    this.reason = reason
  }
}

// --- Wire types (only the fields we actually read) ---------------------------

export interface GridProperties {
  rowCount?: number
  columnCount?: number
  frozenRowCount?: number
}

export interface SheetProperties {
  sheetId?: number
  title?: string
  index?: number
  gridProperties?: GridProperties
}

export interface SpreadsheetResource {
  spreadsheetId?: string
  spreadsheetUrl?: string
  sheets?: { properties?: SheetProperties }[]
}

export interface ValueRange {
  range?: string
  majorDimension?: string
  values?: unknown[][]
}

/** A `Request` of the spreadsheets.batchUpdate API. Kept loose on purpose. */
export type SpreadsheetRequest = Record<string, unknown>

// --- Transport ---------------------------------------------------------------

interface GoogleErrorBody {
  error?: { code?: number; message?: string; status?: string }
}

async function call<T>(
  token: string,
  url: string,
  init?: { method?: string; body?: unknown },
): Promise<T> {
  let response: Response
  try {
    response = await fetch(url, {
      method: init?.method ?? 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init?.body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: init?.body === undefined ? undefined : JSON.stringify(init.body),
    })
  } catch {
    throw new SheetsApiError(
      'Google est injoignable. Vérifie ta connexion internet, puis réessaie.',
      0,
      'network',
    )
  }

  const text = await response.text()
  if (!response.ok) throw toError(response.status, text)
  if (!text) return {} as T
  try {
    return JSON.parse(text) as T
  } catch {
    throw new SheetsApiError('Réponse inattendue de Google (contenu illisible).', response.status)
  }
}

function toError(status: number, body: string): SheetsApiError {
  let detail = ''
  let reason = ''
  try {
    const parsed = JSON.parse(body) as GoogleErrorBody
    detail = parsed.error?.message ?? ''
    reason = parsed.error?.status ?? ''
  } catch {
    detail = body.slice(0, 200)
  }
  const suffix = detail ? ` (${detail})` : ''

  switch (status) {
    case 401:
      return new SheetsApiError(
        `Session Google expirée. Reconnecte-toi depuis Réglages${suffix}`,
        status,
        reason,
      )
    case 403:
      return new SheetsApiError(
        `Accès refusé par Google. L'application n'a pas l'autorisation d'ouvrir cette feuille, ou l'API Google Sheets / Drive n'est pas activée sur ton projet Google Cloud${suffix}`,
        status,
        reason,
      )
    case 404:
      return new SheetsApiError(
        `Feuille de calcul introuvable. Avec l'autorisation « drive.file », l'application ne voit que les fichiers qu'elle a créés elle-même : si tu as créé cette feuille à la main, laisse plutôt l'application en créer une${suffix}`,
        status,
        reason,
      )
    case 429:
      return new SheetsApiError(
        `Quota Google atteint (trop de requêtes). Patiente une minute, puis réessaie${suffix}`,
        status,
        reason,
      )
    default:
      return new SheetsApiError(
        `Erreur Google Sheets ${status}${suffix || '.'}`,
        status,
        reason,
      )
  }
}

// --- Endpoints ---------------------------------------------------------------

/**
 * POST /v4/spreadsheets — creates the file in the user's Drive.
 * The response carries `spreadsheetId`, `spreadsheetUrl` and the sheet ids
 * Google actually assigned, which the caller needs for formatting requests.
 */
export function createSpreadsheet(
  token: string,
  body: {
    properties: { title: string; locale?: string }
    sheets: { properties: SheetProperties }[]
  },
): Promise<SpreadsheetResource> {
  return call<SpreadsheetResource>(token, SHEETS_BASE, { method: 'POST', body })
}

/** GET /v4/spreadsheets/{id}?fields=... — used to discover the existing tabs. */
export function getSpreadsheet(token: string, spreadsheetId: string): Promise<SpreadsheetResource> {
  const fields = encodeURIComponent('spreadsheetId,spreadsheetUrl,sheets.properties')
  return call<SpreadsheetResource>(token, `${SHEETS_BASE}/${encodeURIComponent(spreadsheetId)}?fields=${fields}`)
}

/**
 * GET /v4/spreadsheets/{id}/values:batchGet — one round-trip for every tab.
 *
 * `UNFORMATTED_VALUE` is deliberate: `FORMATTED_VALUE` would return numbers
 * through the spreadsheet's locale ("1,5" on a French sheet), which the numeric
 * columns of `Config` cannot parse. `FORMATTED_STRING` for date/time keeps a
 * cell the user accidentally typed as a real date readable instead of a serial.
 */
export async function batchGetValues(
  token: string,
  spreadsheetId: string,
  ranges: readonly string[],
): Promise<string[][][]> {
  const params = new URLSearchParams()
  for (const range of ranges) params.append('ranges', range)
  params.set('majorDimension', 'ROWS')
  params.set('valueRenderOption', 'UNFORMATTED_VALUE')
  params.set('dateTimeRenderOption', 'FORMATTED_STRING')

  const result = await call<{ valueRanges?: ValueRange[] }>(
    token,
    `${SHEETS_BASE}/${encodeURIComponent(spreadsheetId)}/values:batchGet?${params.toString()}`,
  )
  // The API guarantees `valueRanges` comes back in the order of `ranges`.
  return ranges.map((_, i) => toStringGrid(result.valueRanges?.[i]?.values))
}

/** Cells arrive ragged and loosely typed; the parsers in `core/` want strings. */
function toStringGrid(values: unknown[][] | undefined): string[][] {
  if (!values) return []
  return values.map((row) => row.map((cell) => (cell === null || cell === undefined ? '' : String(cell))))
}

/**
 * POST /v4/spreadsheets/{id}/values:batchUpdate
 *
 * `valueInputOption: 'RAW'` is what keeps the data honest: Google stores the
 * strings exactly as sent, so `TRUE` stays the text "TRUE", `2024-01-05` stays a
 * string rather than becoming a locale-formatted date, and a value starting with
 * `+` or `=` is never interpreted as a formula.
 */
export function batchUpdateValues(
  token: string,
  spreadsheetId: string,
  data: { range: string; values: string[][] }[],
): Promise<unknown> {
  return call(token, `${SHEETS_BASE}/${encodeURIComponent(spreadsheetId)}/values:batchUpdate`, {
    method: 'POST',
    body: { valueInputOption: 'RAW', data: data.map((d) => ({ ...d, majorDimension: 'ROWS' })) },
  })
}

/** POST /v4/spreadsheets/{id}/values/{range}:append — adds rows after the table. */
export function appendValues(
  token: string,
  spreadsheetId: string,
  range: string,
  values: string[][],
): Promise<unknown> {
  const url =
    `${SHEETS_BASE}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}:append` +
    '?valueInputOption=RAW&insertDataOption=INSERT_ROWS'
  return call(token, url, { method: 'POST', body: { majorDimension: 'ROWS', values } })
}

/** POST /v4/spreadsheets/{id}/values/{range}:clear */
export function clearValues(token: string, spreadsheetId: string, range: string): Promise<unknown> {
  const url = `${SHEETS_BASE}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}:clear`
  return call(token, url, { method: 'POST', body: {} })
}

/** POST /v4/spreadsheets/{id}:batchUpdate — structural operations. */
export function batchUpdateSpreadsheet(
  token: string,
  spreadsheetId: string,
  requests: SpreadsheetRequest[],
): Promise<{ replies?: Record<string, unknown>[] }> {
  return call<{ replies?: Record<string, unknown>[] }>(
    token,
    `${SHEETS_BASE}/${encodeURIComponent(spreadsheetId)}:batchUpdate`,
    { method: 'POST', body: { requests } },
  )
}

/** The canonical human URL of a spreadsheet, without an extra API round-trip. */
export function spreadsheetUrlOf(spreadsheetId: string): string {
  return `https://docs.google.com/spreadsheets/d/${encodeURIComponent(spreadsheetId)}/edit`
}
