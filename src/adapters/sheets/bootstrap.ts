/**
 * Creating — and repairing — the user's tracker spreadsheet.
 *
 * This is the piece that makes the `drive.file` scope viable: because the app
 * creates the file itself, Google grants it permanent access to that one file
 * without asking for the broad `spreadsheets` scope (see `src/lib/googleAuth.ts`).
 *
 * A freshly created spreadsheet is meant to be usable *and* readable by a
 * non-technical human directly in Google Sheets: every tab has a bold, frozen
 * header row, `Config` gets sensible column widths and dropdowns, and a `Guide`
 * tab explains — in French — what every column means.
 */
import { HEADERS, SHEET } from '../../core/tabular'
import { starterConfigRows, starterTagRows } from '../../data/starter'
import {
  batchUpdateSpreadsheet,
  batchUpdateValues,
  batchGetValues,
  createSpreadsheet,
  getSpreadsheet,
  spreadsheetUrlOf,
} from './sheetsApi'
import type { SpreadsheetRequest, TokenProvider } from './sheetsApi'

/** The in-sheet documentation tab. Not part of the data model. */
export const GUIDE_SHEET = 'Guide'

/** Bumped whenever the row layout changes in a way the app must migrate. */
export const SCHEMA_VERSION = '1'

/** Tab order in the spreadsheet — `Guide` first, because it is what a human opens. */
const TAB_ORDER = [
  GUIDE_SHEET,
  SHEET.config,
  SHEET.tags,
  SHEET.entries,
  SHEET.notes,
  SHEET.events,
  SHEET.meta,
] as const

/** Canonical header of every data tab, keyed by tab title. */
const HEADER_BY_TAB: Record<string, readonly string[]> = {
  [SHEET.config]: HEADERS.config,
  [SHEET.tags]: HEADERS.tags,
  [SHEET.entries]: HEADERS.entries,
  [SHEET.notes]: HEADERS.notes,
  [SHEET.events]: HEADERS.events,
  [SHEET.meta]: HEADERS.meta,
}

/**
 * Initial grid height per tab.
 *
 * This matters more than it looks: `values.batchUpdate` does NOT grow a sheet,
 * it fails with "exceeds grid limits" once the payload runs past the last row.
 * Google's default of 1 000 rows is only ~3 months of a dozen daily metrics, so
 * `Entries` is created roomy. The repository still grows the grid on demand
 * (see `sheetsRepository.ts`), but nobody should hit that in year one.
 */
const ROW_COUNTS: Record<string, number> = {
  [GUIDE_SHEET]: 200,
  [SHEET.config]: 500,
  [SHEET.tags]: 200,
  [SHEET.entries]: 20000,
  [SHEET.notes]: 5000,
  [SHEET.events]: 1000,
  [SHEET.meta]: 100,
}

const COLUMN_WIDTHS: Record<string, readonly number[]> = {
  // id  label type options min max unit tags group sched mode depends order color help active
  [SHEET.config]: [150, 230, 90, 260, 70, 70, 80, 170, 150, 120, 90, 170, 70, 90, 320, 80],
  [SHEET.tags]: [140, 200, 100],
  [SHEET.entries]: [120, 190, 200, 200],
  [SHEET.notes]: [160, 120, 180, 420, 200],
  [SHEET.events]: [160, 240, 120, 120, 180, 360],
  [SHEET.meta]: [180, 320],
  [GUIDE_SHEET]: [260, 700],
}

export interface CreatedSpreadsheet {
  spreadsheetId: string
  spreadsheetUrl: string
}

/** Progress callback, so the Settings screen can narrate a multi-step creation. */
export type ProgressReporter = (step: string) => void

// --- Creation ----------------------------------------------------------------

/**
 * Create a ready-to-use tracker spreadsheet in the user's own Drive.
 *
 * Three round-trips, on purpose:
 *  1. create the file with all its tabs (one call),
 *  2. write every header + the starter rows + the guide (one values:batchUpdate),
 *  3. formatting: bold headers, column widths, dropdowns (one batchUpdate).
 */
export async function createTrackerSpreadsheet(
  getAccessToken: TokenProvider,
  title: string,
  onProgress?: ProgressReporter,
): Promise<CreatedSpreadsheet> {
  const token = await getAccessToken()

  onProgress?.('Création du fichier dans ton Google Drive…')
  const created = await createSpreadsheet(token, {
    properties: { title: title.trim() || 'Habits Tracker' },
    sheets: TAB_ORDER.map((tabTitle, index) => ({
      properties: {
        sheetId: index,
        title: tabTitle,
        index,
        gridProperties: {
          // The header row stays visible while scrolling a long Entries tab.
          frozenRowCount: 1,
          rowCount: ROW_COUNTS[tabTitle] ?? 1000,
          columnCount: Math.max(HEADER_BY_TAB[tabTitle]?.length ?? 2, 8),
        },
      },
    })),
  })

  const spreadsheetId = created.spreadsheetId
  if (!spreadsheetId) {
    throw new Error("Google n'a pas renvoyé d'identifiant pour la feuille créée.")
  }
  const sheetIds = indexSheetIds(created)

  onProgress?.('Écriture de la configuration de départ…')
  await batchUpdateValues(token, spreadsheetId, [
    { range: `${GUIDE_SHEET}!A1`, values: guideRows() },
    { range: `${SHEET.config}!A1`, values: starterConfigRows() },
    { range: `${SHEET.tags}!A1`, values: starterTagRows() },
    { range: `${SHEET.entries}!A1`, values: [[...HEADERS.entries]] },
    { range: `${SHEET.notes}!A1`, values: [[...HEADERS.notes]] },
    { range: `${SHEET.events}!A1`, values: [[...HEADERS.events]] },
    { range: `${SHEET.meta}!A1`, values: metaRows() },
  ])

  onProgress?.('Mise en forme…')
  const requests = TAB_ORDER.flatMap((tabTitle) => {
    const sheetId = sheetIds.get(tabTitle)
    return sheetId === undefined ? [] : decorationRequests(sheetId, tabTitle)
  })
  // Cosmetics must never cost the user their brand-new spreadsheet.
  try {
    if (requests.length) await batchUpdateSpreadsheet(token, spreadsheetId, requests)
  } catch {
    // Ignored on purpose: the data is already written and perfectly usable.
  }

  return {
    spreadsheetId,
    spreadsheetUrl: created.spreadsheetUrl ?? spreadsheetUrlOf(spreadsheetId),
  }
}

function indexSheetIds(resource: { sheets?: { properties?: { sheetId?: number; title?: string } }[] }) {
  const ids = new Map<string, number>()
  for (const sheet of resource.sheets ?? []) {
    const { title, sheetId } = sheet.properties ?? {}
    if (title && sheetId !== undefined) ids.set(title, sheetId)
  }
  return ids
}

// --- Self-healing ------------------------------------------------------------

export interface SchemaReport {
  /** Tabs that were missing and have just been created. */
  addedTabs: string[]
  /** Tabs whose header row was empty and has just been written. */
  repairedHeaders: string[]
  spreadsheetUrl: string
}

/**
 * Add whatever an existing tracker spreadsheet is missing.
 *
 * Called by the "Vérifier / réparer la structure" button, and useful after a
 * schema addition: a user who created their sheet with an older version gets the
 * new tab without having to start over. Existing data is never touched, and an
 * existing header row is never rewritten — a user is free to reorder columns,
 * since the parsers in `core/tabular.ts` read by column *name*.
 */
export async function ensureSchema(
  spreadsheetId: string,
  getAccessToken: TokenProvider,
): Promise<SchemaReport> {
  const token = await getAccessToken()
  const resource = await getSpreadsheet(token, spreadsheetId)

  const existing = new Set(
    (resource.sheets ?? []).map((s) => s.properties?.title).filter((t): t is string => !!t),
  )
  const missing = TAB_ORDER.filter((tab) => !existing.has(tab))

  if (missing.length) {
    await batchUpdateSpreadsheet(
      token,
      spreadsheetId,
      missing.map((tabTitle) => ({
        addSheet: {
          properties: {
            title: tabTitle,
            gridProperties: {
              frozenRowCount: 1,
              rowCount: ROW_COUNTS[tabTitle] ?? 1000,
              columnCount: Math.max(HEADER_BY_TAB[tabTitle]?.length ?? 2, 8),
            },
          },
        },
      })),
    )
  }

  // Now that every tab exists, look at the header rows.
  const dataTabs = TAB_ORDER.filter((tab) => tab !== GUIDE_SHEET)
  const firstRows = await batchGetValues(
    token,
    spreadsheetId,
    dataTabs.map((tab) => `${tab}!1:1`),
  )

  // A tab we just created gets its full seed content rather than a bare header.
  const seedGuide = missing.includes(GUIDE_SHEET)
  const seedMeta = missing.includes(SHEET.meta)

  const writes: { range: string; values: string[][] }[] = []
  const repairedHeaders: string[] = []
  dataTabs.forEach((tab, i) => {
    if (tab === SHEET.meta && seedMeta) return
    const header = HEADER_BY_TAB[tab]
    if (!header) return
    const row = firstRows[i]?.[0] ?? []
    // Only an *empty* header row is repaired: a customised one is legitimate.
    if (row.some((cell) => cell.trim() !== '')) return
    writes.push({ range: `${tab}!A1`, values: [[...header]] })
    repairedHeaders.push(tab)
  })

  if (seedGuide) writes.push({ range: `${GUIDE_SHEET}!A1`, values: guideRows() })
  if (seedMeta) writes.push({ range: `${SHEET.meta}!A1`, values: metaRows() })

  if (writes.length) await batchUpdateValues(token, spreadsheetId, writes)

  if (missing.length) {
    const refreshed = await getSpreadsheet(token, spreadsheetId)
    const ids = indexSheetIds(refreshed)
    const requests = missing.flatMap((tab) => {
      const sheetId = ids.get(tab)
      return sheetId === undefined ? [] : decorationRequests(sheetId, tab)
    })
    try {
      if (requests.length) await batchUpdateSpreadsheet(token, spreadsheetId, requests)
    } catch {
      // Formatting is optional; the structure is what matters.
    }
  }

  return {
    addedTabs: [...missing],
    repairedHeaders,
    spreadsheetUrl: resource.spreadsheetUrl ?? spreadsheetUrlOf(spreadsheetId),
  }
}

// --- Formatting --------------------------------------------------------------

function decorationRequests(sheetId: number, tabTitle: string): SpreadsheetRequest[] {
  const requests: SpreadsheetRequest[] = [
    {
      updateSheetProperties: {
        properties: { sheetId, gridProperties: { frozenRowCount: 1 } },
        fields: 'gridProperties.frozenRowCount',
      },
    },
  ]

  if (tabTitle !== GUIDE_SHEET) {
    requests.push({
      repeatCell: {
        range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
        cell: {
          userEnteredFormat: {
            textFormat: { bold: true },
            backgroundColor: { red: 0.93, green: 0.95, blue: 0.98 },
          },
        },
        fields: 'userEnteredFormat(textFormat,backgroundColor)',
      },
    })
  }

  const widths = COLUMN_WIDTHS[tabTitle]
  if (widths) {
    widths.forEach((pixelSize, i) => {
      requests.push({
        updateDimensionProperties: {
          range: { sheetId, dimension: 'COLUMNS', startIndex: i, endIndex: i + 1 },
          properties: { pixelSize },
          fields: 'pixelSize',
        },
      })
    })
  }

  if (tabTitle === GUIDE_SHEET) {
    requests.push({
      repeatCell: {
        range: { sheetId, startColumnIndex: 0, endColumnIndex: 2 },
        cell: { userEnteredFormat: { wrapStrategy: 'WRAP', verticalAlignment: 'TOP' } },
        fields: 'userEnteredFormat(wrapStrategy,verticalAlignment)',
      },
    })
    requests.push({
      repeatCell: {
        range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
        cell: { userEnteredFormat: { textFormat: { bold: true, fontSize: 13 } } },
        fields: 'userEnteredFormat.textFormat',
      },
    })
  }

  if (tabTitle === SHEET.config) {
    // Dropdowns on the two columns whose values are a closed set. `strict: false`
    // warns instead of rejecting, so a typo never blocks the user mid-edit.
    requests.push(
      dropdown(sheetId, HEADERS.config.indexOf('type'), ['bool', 'scale', 'choice', 'number', 'text']),
      dropdown(sheetId, HEADERS.config.indexOf('mode'), ['daily', 'quick', 'both']),
      dropdown(sheetId, HEADERS.config.indexOf('active'), ['TRUE', 'FALSE']),
    )
  }

  return requests
}

function dropdown(sheetId: number, columnIndex: number, values: string[]): SpreadsheetRequest {
  return {
    setDataValidation: {
      // No `endRowIndex`: the rule applies down to the bottom of the sheet.
      range: { sheetId, startRowIndex: 1, startColumnIndex: columnIndex, endColumnIndex: columnIndex + 1 },
      rule: {
        condition: { type: 'ONE_OF_LIST', values: values.map((v) => ({ userEnteredValue: v })) },
        showCustomUi: true,
        strict: false,
      },
    },
  }
}

// --- Seeded content ----------------------------------------------------------

function metaRows(): string[][] {
  return [
    [...HEADERS.meta],
    ['schema_version', SCHEMA_VERSION],
    ['created_at', new Date().toISOString()],
    ['app', 'habits-tracker'],
  ]
}

/**
 * The `Guide` tab.
 *
 * Deliberately verbose: this is the only documentation a user has in front of
 * them when they open the spreadsheet six months later and wonder what
 * `depends_on` was for.
 */
function guideRows(): string[][] {
  return [
    ['Habits Tracker — mode d’emploi de cette feuille', ''],
    ['', ''],
    [
      'À quoi sert ce fichier ?',
      "C'est la base de données de l'application. Tout ce que tu vois dans l'application vient d'ici, et tout ce que tu saisis dans l'application est écrit ici. Le fichier t'appartient : il est dans ton Google Drive, personne d'autre n'y a accès.",
    ],
    [
      'Puis-je modifier à la main ?',
      "Oui, c'est même prévu : l'onglet Config est fait pour être édité à la main. Évite en revanche de modifier Entries pendant que l'application est ouverte, et n'utilise pas de formules dans ces onglets (l'application réécrit les cellules et remplacerait la formule par son résultat).",
    ],
    ['', ''],
    ['LES ONGLETS', ''],
    ['Config', "La liste de ce que tu suis. C'est l'onglet que tu modifies. Une ligne = une chose suivie."],
    ['Tags', "Les catégories (Santé, Sport…) et leur couleur. Colonnes : id, label, color (au format #rrggbb)."],
    ['Entries', "Tes réponses, une ligne par (jour, mesure). Rempli par l'application."],
    ['Notes', "Le journal libre. Rempli par l'application."],
    ['Events', 'Les périodes marquantes (vacances, rush…) affichées sur les graphiques.'],
    ['Meta', "Version du format de fichier. Ne pas modifier."],
    ['', ''],
    ['L’ONGLET CONFIG, COLONNE PAR COLONNE', ''],
    ['id', "Identifiant technique, unique, sans espace ni accent (ex. seance_sport). Ne le change plus une fois des données saisies : les lignes d'Entries y font référence."],
    ['label', "Le libellé affiché dans l'application (ex. « Séance de sport du soir »)."],
    ['type', "Le genre de réponse attendue. Valeurs autorisées : bool, scale, choice, number, text (voir plus bas)."],
    ['options', "Les valeurs proposées, séparées par une barre verticale | . Ex. : Faible|Moyen|Fort . Utilisé par les types scale et choice uniquement."],
    ['min / max', "Bornes du type number (ex. 0 et 180 pour une durée en minutes). Laisse vide si sans objet."],
    ['unit', "L'unité affichée après le nombre (min, km, kg…). Type number uniquement."],
    ['tags', "Un ou plusieurs identifiants de l'onglet Tags, séparés par | . Ex. : sport|travail ."],
    ['group', "Le titre de section sous lequel la question apparaît dans le formulaire (ex. Santé)."],
    ['schedule', "Les jours où la question est posée. Valeurs : daily (tous les jours, par défaut), weekdays (lundi→vendredi), weekends (samedi & dimanche), never (jamais posée), ou une liste de jours : lun,mer,ven (ou mon,wed,fri)."],
    ['mode', "Où la mesure apparaît. daily = dans le formulaire du jour. quick = uniquement via le bouton d'ajout rapide, pour un événement rare. both = les deux."],
    ['depends_on', "L'id d'une autre mesure. La question n'est posée que si la réponse à cette autre mesure, le même jour, est positive. C'est ce qui permet d'enchaîner « Crise d'urticaire ? » → « Intensité ? » → « Cause présumée ? » sans encombrer le formulaire."],
    ['order', "Un nombre qui fixe l'ordre d'affichage (10, 20, 30… laisse des trous pour intercaler plus tard)."],
    ['color', "Couleur personnalisée au format #rrggbb. Vide = la couleur du premier tag."],
    ['help', "Une phrase d'aide affichée sous la question. Facultatif."],
    ['active', "TRUE pour suivre la mesure, FALSE pour l'archiver sans perdre l'historique. Vide = TRUE."],
    ['', ''],
    ['LES TYPES DE MESURE', ''],
    ['bool', "Oui / non. Le plus simple et le plus fiable à remplir tous les soirs."],
    ['scale', "Une échelle ordonnée, du plus faible au plus fort, définie dans options (ex. Aucun|Légers|Modérés|Forts). Comparable dans le temps, donc affichable en graphique."],
    ['choice', "Une liste de possibilités sans ordre (ex. une cause présumée). Sert à classer, pas à mesurer."],
    ['number', "Un nombre, avec min, max et unit facultatifs."],
    ['text', "Du texte libre attaché à cette mesure ce jour-là."],
    ['', ''],
    ['EN CAS DE DOUTE', ''],
    [
      'Ajouter une mesure',
      "Ajoute une ligne dans Config, remplis au minimum id, label, type et order, puis recharge l'application.",
    ],
    [
      'Arrêter une mesure',
      "Mets active à FALSE plutôt que de supprimer la ligne : l'historique déjà saisi reste lisible.",
    ],
    [
      'Se tromper n’est pas grave',
      "Une valeur non reconnue n'efface rien : l'application retombe sur une valeur par défaut (type bool, schedule daily, mode daily) plutôt que de faire disparaître la mesure.",
    ],
  ]
}
