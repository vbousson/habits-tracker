/**
 * Demo data for the public deployment.
 *
 * A tracker with an empty dashboard demonstrates nothing, so the offline mode
 * seeds a few months of plausible history. It is generated from a fixed seed:
 * the demo looks identical on every device and in every screenshot, and no
 * random flake can make the charts look different between two visits.
 *
 * The generated behaviour is deliberately imperfect — streaks break, weekends
 * differ from weekdays, flare-ups cluster — because a dashboard of perfect
 * habits shows none of the patterns the app exists to reveal.
 */
import { addDays, todayISO, weekdayOf } from '../core/date'
import { HEADERS } from '../core/tabular'
import { STARTER_METRICS, starterConfigRows, starterTagRows } from './starter'
import type { LocalStore } from '../adapters/local/localRepository'

/** mulberry32 — tiny, fast, and good enough to look organic. */
function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const DAYS = 120

export function buildDemoStore(): LocalStore {
  const random = rng(20260904)
  const today = todayISO()
  const start = addDays(today, -(DAYS - 1))

  const entries: string[][] = [[...HEADERS.entries]]
  const notes: string[][] = [[...HEADERS.notes]]
  const events: string[][] = [[...HEADERS.events]]

  const byId = new Map(STARTER_METRICS.map((m) => [m.id, m]))
  const pick = <T,>(list: readonly T[]): T => list[Math.floor(random() * list.length)]!
  const chance = (p: number) => random() < p

  const record = (date: string, id: string, value: string) => {
    entries.push([date, id, value, `${date}T21:30:00.000Z`])
  }

  // A slow upward drift, so the "trend vs. previous period" panels have something
  // real to report rather than noise around a constant.
  let momentum = 0.45

  for (let i = 0; i < DAYS; i++) {
    const date = addDays(start, i)
    const day = weekdayOf(date)
    const isWeekend = day === 0 || day === 6
    momentum = Math.min(0.9, Math.max(0.25, momentum + (random() - 0.47) * 0.05))

    // A few days are simply not filled in — that is what real usage looks like,
    // and it is what makes "not recorded" vs "recorded as no" visible on the heatmap.
    if (chance(0.07)) continue

    record(date, 'traitement_fond', chance(momentum + 0.25) ? 'TRUE' : 'FALSE')

    const allergyPressure = 0.2 + 0.45 * Math.max(0, Math.sin((i / DAYS) * Math.PI * 1.6))
    const symptoms = chance(allergyPressure)
      ? pick(['Légers', 'Légers', 'Modérés', 'Forts'])
      : 'Aucun'
    record(date, 'symptomes_respiratoires', symptoms)

    if (symptoms !== 'Aucun' && chance(0.55)) {
      record(date, 'antihistaminique', 'TRUE')
      record(date, 'antihistaminique_motif', 'Allergie respiratoire')
    } else if (chance(0.06)) {
      record(date, 'antihistaminique', 'TRUE')
      record(date, 'antihistaminique_motif', pick(['Préventif', 'Urticaire']))
    } else {
      record(date, 'antihistaminique', 'FALSE')
    }

    // Rare events, clustered rather than uniform: three episodes in a fortnight
    // is exactly the pattern the owner wants to be able to show a doctor.
    if (chance(i > DAYS - 30 ? 0.06 : 0.015)) {
      record(date, 'crise_urticaire', 'TRUE')
      record(date, 'urticaire_intensite', pick(['Légère', 'Légère', 'Moyenne', 'Forte']))
      record(date, 'urticaire_cause', pick(['Piscine', 'Effort intense', 'Stress', 'Inconnue']))
    }

    if (!isWeekend) {
      record(date, 'velo_travail', chance(momentum + 0.1) ? 'TRUE' : 'FALSE')
      record(date, 'repas_maison', chance(momentum) ? 'TRUE' : 'FALSE')
    }

    const trained = chance(isWeekend ? 0.35 : momentum)
    record(date, 'seance_sport', trained ? 'TRUE' : 'FALSE')
    if (trained) record(date, 'seance_duree', String(20 + Math.floor(random() * 8) * 5))

    if ([1, 3, 5].includes(day)) record(date, 'sport_club', chance(0.6) ? 'TRUE' : 'FALSE')
    if (isWeekend) record(date, 'batch_cooking', chance(0.4) ? 'TRUE' : 'FALSE')

    record(date, 'grignotage_nocturne', chance(0.85 - momentum * 0.4) ? 'TRUE' : 'FALSE')
    record(date, 'patience', chance(momentum + 0.2) ? 'TRUE' : 'FALSE')

    for (const id of ['enfant_1_etat', 'enfant_2_etat']) {
      const options = byId.get(id)?.options ?? []
      record(date, id, weightedLevel(options, momentum, random))
    }
    for (const id of ['energie', 'sommeil', 'humeur']) {
      const options = byId.get(id)?.options ?? []
      record(date, id, weightedLevel(options, momentum + (isWeekend ? 0.12 : 0), random))
    }
  }

  const noteSeeds: [number, string[], string][] = [
    [-4, ['sante'], "Troisième poussée d'urticaire en deux semaines — à signaler à l'allergologue."],
    [-11, ['travail', 'forme'], 'Semaine de livraison, sommeil court et énergie en berne.'],
    [-19, ['famille'], 'Grosse crise au coucher, difficile à désamorcer.'],
    [-27, ['sport'], 'Reprise du vélo après la pluie, trajet nickel.'],
    [-38, ['social', 'alimentation'], 'Week-end chargé, batch cooking sauté.'],
  ]
  for (const [offset, tags, text] of noteSeeds) {
    const date = addDays(today, offset)
    notes.push([crypto.randomUUID(), date, tags.join('|'), text, `${date}T22:00:00.000Z`])
  }

  const eventSeeds: [number, number, string, string[], string][] = [
    [-14, -8, 'Rush livraison release', ['travail'], 'Période de stress élevé.'],
    [-45, -38, 'Vacances', ['famille', 'social'], ''],
    [-3, -3, 'Rendez-vous allergologue', ['sante'], 'Bilan des six derniers mois.'],
  ]
  for (const [from, to, label, tags, note] of eventSeeds) {
    events.push([crypto.randomUUID(), label, addDays(today, from), addDays(today, to), tags.join('|'), note])
  }

  return { config: starterConfigRows(), tags: starterTagRows(), entries, notes, events }
}

/** Bias the draw towards the upper levels as `momentum` rises. */
function weightedLevel(options: readonly string[], momentum: number, random: () => number): string {
  if (options.length === 0) return ''
  const skewed = Math.pow(random(), Math.max(0.35, 1.6 - momentum))
  const index = Math.min(options.length - 1, Math.floor(skewed * options.length))
  return options[index]!
}
