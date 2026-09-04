/**
 * The starter template.
 *
 * This is the *only* configuration shipped in the repository, and it deliberately
 * contains no personal data: it is a neutral, ready-to-edit example that
 * exercises every field type and display rule the engine supports.
 *
 * It is used in two places:
 *  - to seed a freshly created Google Sheet, so a new user has something to fill
 *    in on day one rather than a blank grid;
 *  - as the configuration of the offline demo mode.
 *
 * Users are expected to rename, delete and add rows directly in their own sheet.
 */
import { HEADERS } from '../core/tabular'

interface StarterMetric {
  id: string
  label: string
  type: 'bool' | 'scale' | 'choice' | 'number' | 'text'
  options?: string[]
  min?: number
  max?: number
  unit?: string
  tags: string[]
  group: string
  schedule?: string
  mode?: 'daily' | 'quick' | 'both'
  depends_on?: string
  order: number
  help?: string
}

export const STARTER_TAGS: { id: string; label: string; color: string }[] = [
  { id: 'sante', label: 'Santé', color: '#d4553f' },
  { id: 'sport', label: 'Sport', color: '#2f9e63' },
  { id: 'travail', label: 'Travail', color: '#3d6fd8' },
  { id: 'alimentation', label: 'Alimentation', color: '#d99022' },
  { id: 'famille', label: 'Famille', color: '#a05fd4' },
  { id: 'forme', label: 'Forme', color: '#0fa3a3' },
  { id: 'social', label: 'Social', color: '#e0568c' },
]

export const STARTER_METRICS: StarterMetric[] = [
  // --- Santé -------------------------------------------------------------
  {
    id: 'traitement_fond', label: 'Traitement de fond pris', type: 'bool',
    tags: ['sante'], group: 'Santé', order: 10,
    help: "La régularité est ce qui compte : réponds même les jours où tu as oublié.",
  },
  {
    id: 'antihistaminique', label: 'Antihistaminique pris', type: 'bool',
    tags: ['sante'], group: 'Santé', order: 20,
  },
  {
    id: 'antihistaminique_motif', label: 'Motif de la prise', type: 'choice',
    options: ['Allergie respiratoire', 'Urticaire', 'Préventif', 'Autre'],
    tags: ['sante'], group: 'Santé', depends_on: 'antihistaminique', order: 21,
  },
  {
    id: 'symptomes_respiratoires', label: 'Symptômes respiratoires', type: 'scale',
    options: ['Aucun', 'Légers', 'Modérés', 'Forts'],
    tags: ['sante'], group: 'Santé', order: 30,
  },
  // A rare event: never asked in the daily flow, always one tap away.
  {
    id: 'crise_urticaire', label: "Crise d'urticaire", type: 'bool',
    tags: ['sante'], group: 'Santé', schedule: 'never', mode: 'quick', order: 40,
    help: "À déclarer au moment où ça arrive, via le bouton d'ajout rapide.",
  },
  {
    id: 'urticaire_intensite', label: 'Intensité de la crise', type: 'scale',
    options: ['Légère', 'Moyenne', 'Forte'],
    tags: ['sante'], group: 'Santé', depends_on: 'crise_urticaire', order: 41,
  },
  {
    id: 'urticaire_cause', label: 'Cause présumée', type: 'text',
    tags: ['sante'], group: 'Santé', depends_on: 'crise_urticaire', order: 42,
    help: 'Piscine, effort, aliment, stress…',
  },

  // --- Sport & travail ---------------------------------------------------
  {
    id: 'velo_travail', label: 'Trajet domicile-travail à vélo', type: 'bool',
    tags: ['sport', 'travail'], group: 'Sport & travail', schedule: 'weekdays', order: 50,
  },
  {
    id: 'seance_sport', label: 'Séance de sport du soir', type: 'bool',
    tags: ['sport'], group: 'Sport & travail', order: 60,
  },
  {
    id: 'seance_duree', label: 'Durée de la séance', type: 'number',
    min: 0, max: 180, unit: 'min',
    tags: ['sport'], group: 'Sport & travail', depends_on: 'seance_sport', order: 61,
  },
  {
    id: 'sport_club', label: 'Sport en club', type: 'bool',
    tags: ['sport', 'social'], group: 'Sport & travail', schedule: 'mon,wed,fri', order: 70,
  },

  // --- Alimentation ------------------------------------------------------
  {
    id: 'repas_maison', label: 'Repas maison apporté au travail', type: 'bool',
    tags: ['alimentation', 'travail'], group: 'Alimentation', schedule: 'weekdays', order: 80,
  },
  {
    id: 'grignotage_nocturne', label: 'Grignotage nocturne', type: 'bool',
    tags: ['alimentation'], group: 'Alimentation', order: 90,
  },
  {
    id: 'batch_cooking', label: 'Batch cooking', type: 'bool',
    tags: ['alimentation'], group: 'Alimentation', schedule: 'weekends', order: 100,
  },

  // --- Famille -----------------------------------------------------------
  {
    id: 'patience', label: 'Patience gardée', type: 'bool',
    tags: ['famille'], group: 'Famille', order: 110,
    help: "Pas de jugement : c'est une mesure, pas une note.",
  },
  {
    id: 'enfant_1_etat', label: 'Enfant 1 — état de la journée', type: 'scale',
    options: ['Difficile', 'Mitigé', 'Bon', 'Très bon'],
    tags: ['famille'], group: 'Famille', order: 120,
  },
  {
    id: 'enfant_2_etat', label: 'Enfant 2 — état de la journée', type: 'scale',
    options: ['Difficile', 'Mitigé', 'Bon', 'Très bon'],
    tags: ['famille'], group: 'Famille', order: 130,
  },

  // --- Forme -------------------------------------------------------------
  {
    id: 'energie', label: "Niveau d'énergie", type: 'scale',
    options: ['Faible', 'Moyen', 'Bon', 'Excellent'],
    tags: ['forme'], group: 'Forme', order: 140,
  },
  {
    id: 'sommeil', label: 'Qualité du sommeil', type: 'scale',
    options: ['Mauvaise', 'Moyenne', 'Bonne', 'Excellente'],
    tags: ['forme'], group: 'Forme', order: 150,
  },
  {
    id: 'humeur', label: 'Humeur générale', type: 'scale',
    options: ['Basse', 'Moyenne', 'Bonne', 'Très bonne'],
    tags: ['forme'], group: 'Forme', order: 160,
  },
]

const cell = (v: unknown): string => (v === undefined || v === null ? '' : String(v))

/** The starter metrics as `Config!A1:P*` rows, header included. */
export function starterConfigRows(): string[][] {
  const rows: string[][] = [[...HEADERS.config]]
  for (const m of STARTER_METRICS) {
    rows.push([
      m.id, m.label, m.type, (m.options ?? []).join('|'),
      cell(m.min), cell(m.max), cell(m.unit),
      m.tags.join('|'), m.group, m.schedule ?? 'daily', m.mode ?? 'daily',
      cell(m.depends_on), String(m.order), '', cell(m.help), 'TRUE',
    ])
  }
  return rows
}

/** The starter tags as `Tags!A1:C*` rows, header included. */
export function starterTagRows(): string[][] {
  return [[...HEADERS.tags], ...STARTER_TAGS.map((t) => [t.id, t.label, t.color])]
}
