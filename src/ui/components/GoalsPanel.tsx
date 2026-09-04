/**
 * The list of goals in force, with a headline verdict.
 *
 * The grouping is deliberate: "À surveiller" comes first, because a goal that is
 * still winnable today is the only one the user can act on. Goals already tenus
 * or manqués are history and sit at the bottom.
 *
 * The `full` variant adds a history strip per goal. That strip is the thing that
 * actually answers "did the resolution hold?" — a single week's verdict says
 * almost nothing, eight of them say everything.
 */
import { useMemo } from 'react'
import { addDays, startOfMonth, todayISO } from '../../core/date'
import { evaluateGoals, goalHistory, goalPeriod, windowOf } from '../../core/goals'
import { GoalCard, periodLabel } from './GoalCard'
import type { GoalOutcome, GoalResult } from '../../core/goals'
import type { DateRange, Entry, Goal, ISODate, TrackerConfig } from '../../core/types'
import '../goals.css'

export interface GoalsPanelProps {
  config: TrackerConfig
  entries: Entry[]
  /** The day whose periods are evaluated. Defaults to today. */
  date?: ISODate
  /** "Now", for testing and for replaying a past day honestly. */
  today?: ISODate
  /** Keep only the goals carrying this tag. */
  tag?: string | null
  groupBy?: 'outcome' | 'tag'
  variant?: 'compact' | 'full'
  /** Periods shown in the history strip, current one included. `full` only. */
  historyPeriods?: number
  onEdit?: (goal: Goal) => void
  /**
   * Fallback for `onEdit`. There is deliberately only one button per goal:
   * opening the editor on an existing goal *is* the "faire évoluer" flow, so a
   * second entry point would only invite the user to pick the wrong one.
   */
  onSupersede?: (goal: Goal) => void
  onCreate?: () => void
}

const OUTCOME_GROUPS: { label: string; outcomes: GoalOutcome[] }[] = [
  { label: 'À surveiller', outcomes: ['at_risk', 'impossible'] },
  { label: 'En cours', outcomes: ['pending'] },
  { label: 'Tenus', outcomes: ['met'] },
  { label: 'Manqués', outcomes: ['missed'] },
]

/** The range covering the last `count` periods of this goal, current included. */
function historyRange(goal: Goal, date: ISODate, count: number): DateRange {
  const period = goalPeriod(goal, date)
  const back = Math.max(0, count - 1)
  switch (goal.period) {
    case 'day':
      return { from: addDays(period.from, -back), to: period.to }
    case 'week':
      return { from: addDays(period.from, -7 * back), to: period.to }
    case 'month': {
      let from = period.from
      for (let i = 0; i < back; i += 1) from = startOfMonth(addDays(from, -1))
      return { from, to: period.to }
    }
    case 'rolling':
      return { from: addDays(period.from, -windowOf(goal) * back), to: period.to }
  }
}

function plural(n: number, one: string, many: string): string {
  return n > 1 ? many : one
}

/** "5 objectifs sur 7 tenus cette semaine" — the one line worth reading. */
function headline(results: GoalResult[]): string {
  const met = results.filter((r) => r.met).length
  const total = results.length
  const periods = new Set(results.map((r) => r.goal.period))
  const first = results[0]?.goal
  const scope = periods.size === 1 && first ? ` ${periodLabel(first)}` : ''
  return `${met} ${plural(total, 'objectif', 'objectifs')} sur ${total} ${plural(met, 'tenu', 'tenus')}${scope}`
}

export function GoalsPanel({
  config,
  entries,
  date = todayISO(),
  today = todayISO(),
  tag = null,
  groupBy = 'outcome',
  variant = 'full',
  historyPeriods = 8,
  onEdit,
  onSupersede,
  onCreate,
}: GoalsPanelProps) {
  const results = useMemo(() => {
    const all = evaluateGoals(config, entries, date, today)
    return tag ? all.filter((r) => r.goal.tags.includes(tag)) : all
  }, [config, entries, date, today, tag])

  const histories = useMemo(() => {
    if (variant !== 'full' || historyPeriods <= 1) return new Map<string, GoalResult[]>()
    return new Map(
      results.map((r) => [
        r.goal.id,
        goalHistory(r.goal, config, entries, historyRange(r.goal, date, historyPeriods), today),
      ]),
    )
  }, [results, config, entries, date, today, variant, historyPeriods])

  if (results.length === 0) {
    return (
      <div className="empty">
        <p>
          {tag
            ? 'Aucun objectif actif sur cette étiquette.'
            : 'Aucun objectif actif pour le moment.'}
        </p>
        <p className="small">
          Un objectif transforme un suivi en verdict : « aller au travail à vélo au moins deux
          fois par semaine » se tient ou se manque, alors qu’une case cochée ne dit rien.
        </p>
        {onCreate && (
          <button type="button" className="btn btn--primary" onClick={onCreate}>
            Créer un objectif
          </button>
        )}
      </div>
    )
  }

  const groups: { label: string; items: GoalResult[] }[] =
    groupBy === 'tag'
      ? [
          ...config.tags.map((t) => ({
            label: t.label,
            items: results.filter((r) => r.goal.tags[0] === t.id),
          })),
          {
            label: 'Sans étiquette',
            items: results.filter(
              (r) => !r.goal.tags[0] || !config.tags.some((t) => t.id === r.goal.tags[0]),
            ),
          },
        ]
      : OUTCOME_GROUPS.map((g) => ({
          label: g.label,
          items: results.filter((r) => g.outcomes.includes(r.outcome)),
        }))

  return (
    <div className="goals">
      <p className="goals__headline">
        <strong>{headline(results)}</strong>
      </p>

      {groups
        .filter((g) => g.items.length > 0)
        .map((group) => (
          <section className="goals__group" key={group.label}>
            <h3 className="section-title">
              {group.label}
              <span className="faint">{group.items.length}</span>
            </h3>
            <ul className="goals__list">
              {group.items.map((result) => (
                <li key={result.goal.id}>
                  <GoalCard
                    result={result}
                    tags={config.tags}
                    variant={variant}
                    history={histories.get(result.goal.id)}
                    onEdit={onEdit ?? onSupersede}
                  />
                </li>
              ))}
            </ul>
          </section>
        ))}

      {onCreate && (
        <button type="button" className="btn btn--block" onClick={onCreate}>
          Nouvel objectif
        </button>
      )}
    </div>
  )
}
