/**
 * Create a goal, or make an existing one evolve.
 *
 * The important design decision is that editing an existing goal does **not**
 * overwrite it. The primary action is "Faire évoluer l'objectif", which calls
 * `supersede`: the current goal is closed the day before the new start date and
 * a fresh row takes over. That is the only way "deux fois par semaine en
 * septembre, trois à partir de janvier" can stay true — an in-place edit would
 * retroactively re-judge every week already scored against the old bar.
 *
 * A goal genuinely created by mistake is a different problem, and gets a plain
 * destructive "Supprimer" instead.
 */
import { useState } from 'react'
import { addDays, todayISO } from '../../core/date'
import { nextGoalId, supersede } from '../../core/goals'
import { Sheet } from './Sheet'
import { TagPicker } from './TagPicker'
import { IconTrash } from './Icons'
import type {
  Goal, GoalAggregate, GoalComparator, GoalPeriod, ISODate, TrackerConfig,
} from '../../core/types'
import '../goals.css'

export interface GoalEditorProps {
  config: TrackerConfig
  /** `null` creates a goal; anything else opens the "faire évoluer" flow. */
  goal: Goal | null
  /** Default start date of a new or superseding goal. */
  defaultDate?: ISODate
  /**
   * Receives the rows to persist — **one** for a creation, **two** for an
   * evolution (the closed previous goal first, then its replacement). Save them
   * all, in order.
   */
  onSave: (goals: Goal[]) => void
  onDelete: (id: string) => void
  onClose: () => void
}

const AGGREGATES: { value: GoalAggregate; label: string; help: string }[] = [
  { value: 'count', label: 'Nombre de jours', help: 'Jours où au moins une des métriques est positive.' },
  { value: 'sum', label: 'Somme', help: 'Total des valeurs numériques de la période.' },
  { value: 'average', label: 'Moyenne', help: 'Moyenne des réponses ; une échelle compte en pourcentage.' },
  { value: 'rate', label: 'Taux (%)', help: 'Jours positifs sur jours où la question était posée.' },
  { value: 'streak', label: 'Série', help: 'Plus longue suite de jours positifs de la période.' },
]

const COMPARATORS: { value: GoalComparator; label: string }[] = [
  { value: '>=', label: 'au moins' },
  { value: '>', label: 'plus de' },
  { value: '<=', label: 'au plus' },
  { value: '<', label: 'moins de' },
  { value: '==', label: 'exactement' },
]

const PERIODS: { value: GoalPeriod; label: string }[] = [
  { value: 'day', label: 'par jour' },
  { value: 'week', label: 'par semaine' },
  { value: 'month', label: 'par mois' },
  { value: 'rolling', label: 'sur une fenêtre glissante' },
]

/** `Aller au travail à vélo` → `obj_aller_au_travail_a_velo`. */
function slugify(label: string): string {
  const base = label
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40)
  return base ? `obj_${base}` : `obj_${Date.now()}`
}

export function GoalEditor({
  config,
  goal,
  defaultDate = todayISO(),
  onSave,
  onDelete,
  onClose,
}: GoalEditorProps) {
  const editing = goal !== null
  const [label, setLabel] = useState(goal?.label ?? '')
  const [metricIds, setMetricIds] = useState<string[]>(goal?.metrics ?? [])
  const [aggregate, setAggregate] = useState<GoalAggregate>(goal?.aggregate ?? 'count')
  const [comparator, setComparator] = useState<GoalComparator>(goal?.comparator ?? '>=')
  const [target, setTarget] = useState(goal ? String(goal.target) : '2')
  const [period, setPeriod] = useState<GoalPeriod>(goal?.period ?? 'week')
  const [windowDays, setWindowDays] = useState(String(goal?.windowDays ?? 7))
  const [onlyWhen, setOnlyWhen] = useState(goal?.onlyWhen ?? '')
  const [tagIds, setTagIds] = useState<string[]>(goal?.tags ?? [])
  const [help, setHelp] = useState(goal?.help ?? '')
  const [from, setFrom] = useState<ISODate>(
    // A superseding goal starts today by default, never before the goal it replaces.
    goal && goal.from && defaultDate <= goal.from ? addDays(goal.from, 1) : defaultDate,
  )

  const choosable = config.metrics.filter((m) => m.active)
  const parsedTarget = Number(target.replace(',', '.'))
  const parsedWindow = Number(windowDays)

  const error = (() => {
    if (label.trim().length === 0) return 'Donnez un intitulé à l’objectif.'
    if (metricIds.length === 0) return 'Choisissez au moins une métrique à mesurer.'
    if (!Number.isFinite(parsedTarget)) return 'La cible doit être un nombre.'
    if (period === 'rolling' && (!Number.isFinite(parsedWindow) || parsedWindow < 1)) {
      return 'La fenêtre glissante doit faire au moins un jour.'
    }
    // The replacement must start strictly after the goal it closes, otherwise
    // the closed row would end before it began and lose its own history.
    if (goal && goal.from && from <= goal.from) {
      return `La nouvelle version doit commencer après le ${goal.from}.`
    }
    return null
  })()

  const takenIds = config.goals.map((g) => g.id)
  const newId = () => {
    const base = slugify(label)
    return takenIds.includes(base) ? nextGoalId(base, takenIds) : base
  }

  const draft = (): Goal => ({
    id: goal?.id ?? newId(),
    label: label.trim(),
    metrics: metricIds,
    aggregate,
    comparator,
    target: parsedTarget,
    period,
    windowDays: period === 'rolling' ? Math.floor(parsedWindow) : undefined,
    onlyWhen: onlyWhen || undefined,
    from: goal?.from ?? from,
    to: goal?.to,
    tags: tagIds,
    color: goal?.color,
    help: help.trim() || undefined,
    active: true,
    order: goal?.order ?? (config.goals.reduce((max, g) => Math.max(max, g.order), 0) + 10),
  })

  const submit = () => {
    if (error) return
    if (!goal) {
      onSave([draft()])
      onClose()
      return
    }
    // `supersede` assigns id/from/to itself, after spreading the changes, so the
    // three fields the draft still carries cannot leak into the replacement.
    const changes: Partial<Omit<Goal, 'id' | 'from' | 'to'>> = draft()
    onSave(supersede(goal, changes, from, config.goals))
    onClose()
  }

  const remove = () => {
    if (!goal) return
    if (!window.confirm(`Supprimer « ${goal.label} » et tout son historique de suivi ?`)) return
    onDelete(goal.id)
    onClose()
  }

  const toggleMetric = (id: string) => {
    setMetricIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]))
  }

  return (
    <Sheet
      title={editing ? 'Faire évoluer l’objectif' : 'Nouvel objectif'}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Annuler
          </button>
          <button
            type="button"
            className="btn btn--primary"
            onClick={submit}
            disabled={error !== null}
          >
            {editing ? 'Faire évoluer l’objectif' : 'Créer l’objectif'}
          </button>
        </>
      }
    >
      <div className="goal-editor">
        <div className="field">
          <label className="field__label" htmlFor="goal-label">
            Intitulé
          </label>
          <input
            id="goal-label"
            className="input"
            type="text"
            value={label}
            placeholder="Aller au travail à vélo 2 fois par semaine"
            onChange={(e) => setLabel(e.target.value)}
          />
        </div>

        <div className="field">
          <span className="field__label" id="goal-metrics-label">
            Métriques mesurées
          </span>
          <div className="chips" role="group" aria-labelledby="goal-metrics-label">
            {choosable.map((metric) => (
              <button
                key={metric.id}
                type="button"
                className="chip"
                aria-pressed={metricIds.includes(metric.id)}
                onClick={() => toggleMetric(metric.id)}
              >
                {metric.label}
              </button>
            ))}
          </div>
          <p className="field__help">
            Plusieurs métriques comptent comme une seule : une journée compte dès que l’une
            d’entre elles est positive.
          </p>
        </div>

        <div className="field">
          <label className="field__label" htmlFor="goal-aggregate">
            Ce qui est mesuré
          </label>
          <select
            id="goal-aggregate"
            className="select"
            value={aggregate}
            onChange={(e) => setAggregate(e.target.value as GoalAggregate)}
          >
            {AGGREGATES.map((a) => (
              <option key={a.value} value={a.value}>
                {a.label}
              </option>
            ))}
          </select>
          <p className="field__help">{AGGREGATES.find((a) => a.value === aggregate)?.help}</p>
        </div>

        <div className="goal-editor__row">
          <div className="field">
            <label className="field__label" htmlFor="goal-comparator">
              Sens
            </label>
            <select
              id="goal-comparator"
              className="select"
              value={comparator}
              onChange={(e) => setComparator(e.target.value as GoalComparator)}
            >
              {COMPARATORS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="field__label" htmlFor="goal-target">
              Cible
            </label>
            <input
              id="goal-target"
              className="input numeric"
              type="number"
              inputMode="decimal"
              step="any"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
            />
          </div>
        </div>

        <div className="field">
          <label className="field__label" htmlFor="goal-period">
            Période
          </label>
          <select
            id="goal-period"
            className="select"
            value={period}
            onChange={(e) => setPeriod(e.target.value as GoalPeriod)}
          >
            {PERIODS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
          <p className="field__help">Les semaines vont du lundi au dimanche.</p>
        </div>

        {period === 'rolling' && (
          <div className="field">
            <label className="field__label" htmlFor="goal-window">
              Longueur de la fenêtre (jours)
            </label>
            <input
              id="goal-window"
              className="input numeric"
              type="number"
              inputMode="numeric"
              min={1}
              value={windowDays}
              onChange={(e) => setWindowDays(e.target.value)}
            />
            <p className="field__help">
              Le verdict ne se remet pas à zéro le lundi : il porte toujours sur les derniers
              jours.
            </p>
          </div>
        )}

        <div className="field">
          <label className="field__label" htmlFor="goal-onlywhen">
            Seulement les jours où…
          </label>
          <select
            id="goal-onlywhen"
            className="select"
            value={onlyWhen}
            onChange={(e) => setOnlyWhen(e.target.value)}
          >
            <option value="">— tous les jours —</option>
            {choosable.map((metric) => (
              <option key={metric.id} value={metric.id}>
                {metric.label}
              </option>
            ))}
          </select>
          <p className="field__help">
            « Apporter son repas quatre fois par semaine » ne se juge que sur les jours passés au
            travail.
          </p>
        </div>

        <TagPicker tags={config.tags} value={tagIds} onChange={setTagIds} />

        <div className="field">
          <label className="field__label" htmlFor="goal-help">
            Précision (optionnel)
          </label>
          <input
            id="goal-help"
            className="input"
            type="text"
            value={help}
            onChange={(e) => setHelp(e.target.value)}
          />
        </div>

        {goal && (
          <>
            <div className="field">
              <label className="field__label" htmlFor="goal-from">
                Nouvelle barre applicable à partir du
              </label>
              <input
                id="goal-from"
                className="input"
                type="date"
                value={from}
                min={goal.from ? addDays(goal.from, 1) : undefined}
                onChange={(e) => {
                  if (e.target.value) setFrom(e.target.value)
                }}
              />
            </div>
            <p className="goal-editor__why">
              L’ancienne version est close la veille et conservée : les semaines déjà jugées
              gardent la barre qui était la vôtre à l’époque.
            </p>
          </>
        )}

        {error && (
          <p className="goal-editor__error" role="alert">
            {error}
          </p>
        )}

        {goal && (
          <button type="button" className="btn btn--danger btn--block" onClick={remove}>
            <IconTrash size={16} />
            Supprimer l’objectif
          </button>
        )}
      </div>
    </Sheet>
  )
}
