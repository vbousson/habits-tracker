/**
 * Starter goals.
 *
 * Kept in their own file so the neutral metric template and the targets placed on
 * it stay separable: a user may well want to keep the metrics and throw away
 * every goal, or the reverse.
 *
 * These deliberately exercise the whole engine — a single-metric weekly count, a
 * multi-metric one, an upper bound rather than a lower one, a daily target and a
 * rolling window — so the goals screen has something honest to render on day one.
 *
 * `from` is left empty, which means "applies since forever". A real goal that
 * replaces another one carries a real start date; see `to` in `src/core/types.ts`.
 */
import { HEADERS } from '../core/tabular'

interface StarterGoal {
  id: string
  label: string
  metrics: string[]
  aggregate: 'count' | 'sum' | 'average' | 'rate' | 'streak'
  comparator: '>=' | '<=' | '==' | '>' | '<'
  target: number
  period: 'day' | 'week' | 'month' | 'rolling'
  window_days?: number
  only_when?: string
  tags: string[]
  help?: string
  order: number
}

export const STARTER_GOALS: StarterGoal[] = [
  {
    id: 'obj_traitement', label: 'Traitement de fond tous les jours',
    metrics: ['traitement_fond'], aggregate: 'count', comparator: '>=', target: 7,
    period: 'week', tags: ['sante'], order: 10,
    help: "Une désensibilisation ne tolère pas les trous : l'objectif est la semaine pleine.",
  },
  {
    id: 'obj_velo', label: 'Aller au travail à vélo 2 fois par semaine',
    metrics: ['velo_travail'], aggregate: 'count', comparator: '>=', target: 2,
    period: 'week', tags: ['sport', 'travail'], order: 20,
  },
  {
    id: 'obj_sport', label: 'Bouger 3 fois par semaine',
    // Several metrics on purpose: a club session and an evening workout both count.
    metrics: ['seance_sport', 'sport_club', 'velo_travail'],
    aggregate: 'count', comparator: '>=', target: 3,
    period: 'week', tags: ['sport'], order: 30,
    help: 'Séance du soir, club ou trajet à vélo — tout compte.',
  },
  {
    id: 'obj_repas', label: 'Apporter son repas 4 fois par semaine',
    metrics: ['repas_maison'], aggregate: 'count', comparator: '>=', target: 4,
    period: 'week', tags: ['alimentation', 'travail'], order: 40,
  },
  {
    id: 'obj_grignotage', label: 'Grignoter au plus 2 soirs par semaine',
    // An upper bound: progress here means staying below the line, not above it.
    metrics: ['grignotage_nocturne'], aggregate: 'count', comparator: '<=', target: 2,
    period: 'week', tags: ['alimentation'], order: 50,
  },
  {
    id: 'obj_batch', label: 'Un batch cooking par semaine',
    metrics: ['batch_cooking'], aggregate: 'count', comparator: '>=', target: 1,
    period: 'week', tags: ['alimentation'], order: 60,
  },
  {
    id: 'obj_patience', label: 'Garder patience 6 jours sur 7',
    metrics: ['patience'], aggregate: 'count', comparator: '>=', target: 6,
    period: 'week', tags: ['famille'], order: 70,
  },
  {
    id: 'obj_sommeil', label: 'Sommeil correct sur les 30 derniers jours',
    // A rolling window, so the verdict does not reset every Monday.
    metrics: ['sommeil'], aggregate: 'rate', comparator: '>=', target: 70,
    period: 'rolling', window_days: 30, tags: ['forme'], order: 80,
    help: 'Au moins 70 % des nuits attendues au-dessus du niveau le plus bas. Une nuit non renseignée compte comme manquée — le suivi fait partie de l’objectif.',
  },
]

const cell = (v: unknown): string => (v === undefined || v === null ? '' : String(v))

/** The starter goals as `Goals!A1:P*` rows, header included. */
export function starterGoalRows(): string[][] {
  const rows: string[][] = [[...HEADERS.goals]]
  for (const g of STARTER_GOALS) {
    rows.push([
      g.id, g.label, g.metrics.join('|'), g.aggregate, g.comparator, String(g.target),
      g.period, cell(g.window_days), cell(g.only_when),
      '', '', g.tags.join('|'), '', cell(g.help), 'TRUE', String(g.order),
    ])
  }
  return rows
}
