/**
 * Quick-add: declaring a rare event without going through the daily form.
 *
 * The root question defaults to "Oui" — the sheet is only ever opened because
 * something happened — and `buildQuickForm` then reveals the follow-ups its
 * answer unlocks, so an urticaria flare-up immediately asks for its intensity
 * and presumed cause.
 *
 * Answers are held in a local draft and written through `tracker.setValue` on
 * validation, so closing the sheet never leaves a stray "Oui" behind.
 */
import { useState } from 'react'
import { buildQuickForm, quickAddMetrics } from '../../core/form'
import type { Answers } from '../../core/form'
import { formatDayLong, todayISO } from '../../core/date'
import { isTruthy } from '../../core/values'
import type { ISODate, Metric, MetricValue, TrackerConfig } from '../../core/types'
import type { TrackerApi } from '../../lib/useTracker'
import { FieldInput, dependentIds } from './FieldInput'
import { Sheet } from './Sheet'
import { IconChevronLeft } from './Icons'

export interface QuickAddProps {
  tracker: TrackerApi
  config: TrackerConfig
  /** Day proposed by default — the day currently shown by the caller. */
  date: ISODate
  onClose: () => void
}

interface Draft {
  rootId: string | null
  day: ISODate
  answers: Answers
}

export function QuickAdd({ tracker, config, date, onClose }: QuickAddProps) {
  const roots = quickAddMetrics(config)
  const [draft, setDraft] = useState<Draft>(() =>
    start(tracker, config, roots.length === 1 ? roots[0]!.id : null, date),
  )

  const today = todayISO()
  const root = draft.rootId ? config.metrics.find((m) => m.id === draft.rootId) : undefined
  const fields = root ? buildQuickForm(config, draft.answers, root.id) : []

  const change = (metric: Metric, value: MetricValue) => {
    setDraft((previous) => {
      const answers: Answers = new Map(previous.answers)
      answers.set(metric.id, value)
      // A follow-up that is no longer revealed must not keep a hidden answer.
      if (!isTruthy(metric, value)) {
        for (const id of dependentIds(config.metrics, metric.id)) answers.set(id, null)
      }
      return { ...previous, answers }
    })
  }

  const submit = () => {
    const stored = tracker.answersFor(draft.day)
    for (const [id, value] of draft.answers) {
      const before = stored.get(id) ?? null
      if ((value ?? null) !== before) tracker.setValue(draft.day, id, value)
    }
    onClose()
  }

  const footer = root ? (
    <>
      <button type="button" className="btn" onClick={onClose}>
        Annuler
      </button>
      <button type="button" className="btn btn--primary" onClick={submit}>
        Enregistrer
      </button>
    </>
  ) : undefined

  return (
    <Sheet title="Ajout rapide" onClose={onClose} footer={footer}>
      {!root && (
        <div className="stack stack--tight">
          <p className="small muted">Que veux-tu déclarer ?</p>
          {roots.length === 0 ? (
            <p className="empty">
              Aucun indicateur en ajout rapide. Passe un indicateur en mode « quick » dans ta
              feuille pour le retrouver ici.
            </p>
          ) : (
            <div className="quick-list">
              {roots.map((metric) => (
                <button
                  key={metric.id}
                  type="button"
                  className="quick-item"
                  onClick={() => setDraft(start(tracker, config, metric.id, draft.day))}
                >
                  <span className="dot" style={{ background: colorOf(config, metric) }} />
                  <span className="grow">
                    <span className="quick-item__label">{metric.label}</span>
                    {metric.help && <span className="field__help"> {metric.help}</span>}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {root && (
        <>
          {roots.length > 1 && (
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => setDraft((previous) => ({ ...previous, rootId: null }))}
            >
              <IconChevronLeft size={16} />
              Changer d'indicateur
            </button>
          )}

          <div className="field">
            <label className="field__label" htmlFor="quick-add-day">
              Jour
            </label>
            <input
              id="quick-add-day"
              className="input"
              type="date"
              value={draft.day}
              max={today}
              onChange={(e) => {
                const next = e.target.value
                if (next) setDraft(start(tracker, config, draft.rootId, next))
              }}
            />
            <p className="field__help">{formatDayLong(draft.day)}</p>
          </div>

          <div className="form-section">
            {fields.map((field) => (
              <FieldInput
                key={field.metric.id}
                field={field}
                onChange={(value) => change(field.metric, value)}
              />
            ))}
          </div>
        </>
      )}
    </Sheet>
  )
}

/** Seed the draft from what the day already holds, defaulting a boolean root to "Oui". */
function start(
  tracker: TrackerApi,
  config: TrackerConfig,
  rootId: string | null,
  day: ISODate,
): Draft {
  const answers: Answers = new Map(tracker.answersFor(day))
  if (rootId) {
    const root = config.metrics.find((m) => m.id === rootId)
    if (root && root.type === 'bool' && (answers.get(rootId) ?? null) === null) {
      answers.set(rootId, true)
    }
  }
  return { rootId, day, answers }
}

function colorOf(config: TrackerConfig, metric: Metric): string {
  if (metric.color) return metric.color
  const tag = config.tags.find((t) => metric.tags.includes(t.id))
  return tag?.color ?? 'var(--accent)'
}
