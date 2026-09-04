/**
 * One goal's current standing.
 *
 * Two rules shape this card:
 *
 *  - **The verdict is never colour alone.** Every tone is paired with a word
 *    ("Tenu", "Manqué", "Dépassé"). This is health data, and a reader who cannot
 *    separate red from green has to get the same answer as everyone else.
 *  - **A budget is not a progress bar.** For an upper bound ("grignoter au plus
 *    2 soirs") the bar fills as the *allowance is spent*, is hatched so a full
 *    bar cannot be mistaken for success, and the wording switches to "1 sur 2
 *    autorisés". Drawing `consumed` where a lower bound draws `progress` would
 *    congratulate someone for snacking every night.
 *
 * The wording is present-tense ("cette semaine"), so the card is meant for the
 * period containing today; past periods are shown as the history strip instead.
 */
import { formatDayShort } from '../../core/date'
import { metricColor } from '../../core/colors'
import { windowOf } from '../../core/goals'
import type { GoalResult } from '../../core/goals'
import type { Goal, Tag } from '../../core/types'
import '../goals.css'

export type GoalTone = 'good' | 'warn' | 'bad' | undefined

export interface GoalCardProps {
  result: GoalResult
  tags: Tag[]
  /** `compact` for the daily screen, `full` for the dashboard. */
  variant?: 'compact' | 'full'
  /** Past periods, oldest first — rendered as a met/missed strip. */
  history?: GoalResult[]
  onEdit?: (goal: Goal) => void
}

const PERIOD_NOUN: Record<Goal['period'], string> = {
  day: 'journée',
  week: 'semaine',
  month: 'mois',
  rolling: 'fenêtre',
}

/** "cette semaine", "ce mois", "sur 30 jours" — the scope, in plain French. */
export function periodLabel(goal: Goal): string {
  switch (goal.period) {
    case 'day':
      return 'aujourd’hui'
    case 'week':
      return 'cette semaine'
    case 'month':
      return 'ce mois'
    case 'rolling':
      return `sur ${windowOf(goal)} jours`
  }
}

/** The verdict, as a word. Upper bounds get their own vocabulary. */
export function outcomeWord(result: GoalResult): string {
  if (result.empty) return 'Hors période'
  switch (result.outcome) {
    case 'met':
      return 'Tenu'
    case 'missed':
      return 'Manqué'
    case 'at_risk':
      return result.direction === 'at_most' ? 'Limite atteinte' : 'Ça se joue'
    case 'impossible':
      return result.direction === 'at_most' ? 'Dépassé' : 'Hors d’atteinte'
    case 'pending':
      return 'En cours'
  }
}

export function outcomeTone(result: GoalResult): GoalTone {
  switch (result.outcome) {
    case 'met':
      return 'good'
    case 'at_risk':
      return 'warn'
    case 'missed':
    case 'impossible':
      return 'bad'
    case 'pending':
      return undefined
  }
}

function fmt(n: number): string {
  if (Number.isInteger(n)) return String(n)
  return n.toFixed(1).replace('.', ',')
}

function plural(n: number, one: string, many: string): string {
  return n > 1 ? many : one
}

/**
 * The unit to print after a figure. `rate` is always a percentage; `sum` and
 * `average` carry the metric's own unit when every metric is numeric, and a
 * percentage otherwise (that is exactly when the engine normalised a scale).
 */
function unitOf(result: GoalResult): string {
  switch (result.goal.aggregate) {
    case 'rate':
      return ' %'
    case 'streak':
      return ' j'
    case 'count':
      return ''
    default: {
      const numeric = result.metrics.filter((m) => m.type === 'number')
      if (numeric.length > 0 && numeric.length === result.metrics.length) {
        const unit = numeric[0]?.unit
        return unit ? ` ${unit}` : ''
      }
      return result.goal.aggregate === 'average' ? ' %' : ''
    }
  }
}

/** "3 / 2" for a bar to clear, "1 sur 2 autorisés" for an allowance to keep. */
export function goalValueText(result: GoalResult): string {
  const unit = unitOf(result)
  const value = `${fmt(result.value)}${unit}`
  const target = `${fmt(result.target)}${unit}`
  if (result.direction === 'at_most') {
    return `${value} sur ${target} ${plural(result.target, 'autorisé', 'autorisés')}`
  }
  return `${value} / ${target}`
}

/** What is still needed, or what is left of the allowance. */
export function goalNote(result: GoalResult): string | null {
  if (result.empty) return 'L’objectif ne couvre aucun jour de cette période.'
  if (result.daysLeft === 0) return null

  const left = `il reste ${result.daysLeft} ${plural(result.daysLeft, 'jour', 'jours')}`

  if (result.direction === 'at_most') {
    const allowance = Math.max(0, Math.floor(result.target - result.value))
    if (!result.met) return `${left}, la limite est déjà dépassée`
    if (allowance === 0) return `${left}, plus aucun écart autorisé`
    return `${left}, ${allowance} ${plural(allowance, 'écart', 'écarts')} encore ${plural(allowance, 'autorisé', 'autorisés')}`
  }

  if (result.met) return `objectif atteint, ${left}`
  if (result.remaining !== null) {
    if (result.outcome === 'impossible') return `${left}, ${result.remaining} de plus qu’il n’est possible`
    return `${left}, ${result.remaining} ${plural(result.remaining, 'jour', 'jours')} à valider`
  }
  return left
}

/** "Semaine partielle : jugée sur 3 jours (du 04/09 au 06/09)". */
function partialHint(result: GoalResult): string | null {
  if (!result.partial || result.empty) return null
  const noun = PERIOD_NOUN[result.goal.period]
  const days = result.eligibleDays + result.daysLeft
  const capital = noun.charAt(0).toUpperCase() + noun.slice(1)
  return `${capital} partielle : jugée sur ${days} ${plural(days, 'jour', 'jours')} (du ${formatDayShort(result.bounds.from)} au ${formatDayShort(result.bounds.to)})`
}

function stripLabel(history: GoalResult[], goal: Goal): string {
  const met = history.filter((h) => h.met).length
  const noun = PERIOD_NOUN[goal.period]
  const plurals: Record<Goal['period'], string> = {
    day: 'journées tenues',
    week: 'semaines tenues',
    month: 'mois tenus',
    rolling: 'fenêtres tenues',
  }
  return `${met} ${history.length > 1 ? plurals[goal.period] : `${noun} tenue`} sur ${history.length}`
}

export function GoalCard({ result, tags, variant = 'full', history, onEdit }: GoalCardProps) {
  const { goal } = result
  const tone = outcomeTone(result)
  const word = outcomeWord(result)
  const valueText = goalValueText(result)
  const scope = periodLabel(goal)
  const note = goalNote(result)
  const hint = partialHint(result)
  const budget = result.direction === 'at_most'
  // A budget bar shows the spend; a lower bound shows the progress. Never swap.
  const fill = budget ? result.consumed : result.progress

  return (
    <article className={`goal goal--${variant}`}>
      <header className="goal__head">
        <h3 className="goal__label">{goal.label}</h3>
        {result.metrics.length > 0 && (
          <span className="goal__dots" aria-hidden="true">
            {result.metrics.map((metric) => (
              <span
                key={metric.id}
                className="goal__dot"
                style={{ background: metricColor(metric, tags) }}
                title={metric.label}
              />
            ))}
          </span>
        )}
        <span className="goal__verdict" data-tone={tone}>
          {word}
        </span>
      </header>

      <div className="goal__figure">
        <span className="goal__value">{valueText}</span>
        <span className="goal__scope">{scope}</span>
      </div>

      <div
        className={`goal__bar${budget ? ' goal__bar--budget' : ''}`}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={Math.max(1, result.target, result.value)}
        aria-valuenow={Math.round(result.value * 10) / 10}
        aria-valuetext={`${valueText} ${scope} — ${word}${note ? `, ${note}` : ''}`}
      >
        <div
          className="goal__fill"
          data-tone={tone}
          style={{ width: `${Math.round(Math.min(1, Math.max(0, fill)) * 100)}%` }}
        />
      </div>

      {note && (
        <p
          className={`goal__note${tone === 'warn' ? ' goal__note--warn' : tone === 'bad' ? ' goal__note--bad' : ''}`}
        >
          {note}
        </p>
      )}

      {variant === 'full' && (
        <>
          {hint && <p className="goal__hint">{hint}</p>}

          {result.missingMetrics.length > 0 && (
            <p className="goal__note goal__note--bad">
              {`Métrique introuvable dans la configuration : ${result.missingMetrics.join(', ')}`}
            </p>
          )}

          {goal.help && <p className="goal__hint">{goal.help}</p>}

          {history && history.length > 0 && (
            <div className="goal__strip" role="img" aria-label={stripLabel(history, goal)}>
              {history.map((past) => (
                <span
                  key={`${past.bounds.from}-${past.bounds.to}`}
                  className="goal__square"
                  data-outcome={past.outcome}
                  data-partial={past.partial ? 'true' : 'false'}
                  title={`${formatDayShort(past.bounds.from)} → ${formatDayShort(past.bounds.to)} · ${outcomeWord(past)}${past.partial ? ' (période partielle)' : ''}`}
                />
              ))}
            </div>
          )}

          {onEdit && (
            <div className="goal__actions">
              <button type="button" className="btn btn--sm" onClick={() => onEdit(goal)}>
                Modifier
              </button>
            </div>
          )}
        </>
      )}
    </article>
  )
}
