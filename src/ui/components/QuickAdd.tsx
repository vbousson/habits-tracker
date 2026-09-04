/**
 * Quick-add: declaring a rare event the moment it happens, without going
 * through the daily form.
 *
 * Three decisions worth knowing about.
 *
 * **It only ever writes to today.** Asking for the date again was the wrong
 * question: the button is pressed *because* something is happening now.
 * Backfilling a past day is still possible — from the day screen, which has its
 * own date navigation and is the right place for it. The sheet says which day
 * it lands on, once, so nobody has to wonder.
 *
 * **The chooser is always shown**, even with a single quick metric. Skipping it
 * when there was only one made the feature look hard-wired to that one event,
 * which is exactly the impression this file exists to remove.
 *
 * **Answers are held in a local draft** and written through `tracker.setValue`
 * only on validation, so opening and cancelling never leaves a stray "Oui"
 * behind. Saving returns to the chooser rather than closing, because flare-ups
 * come in pairs more often than the UI used to admit.
 */
import { useState } from 'react'
import { buildQuickForm, quickAddMetrics } from '../../core/form'
import type { Answers } from '../../core/form'
import { formatDayLong, todayISO } from '../../core/date'
import { isTruthy } from '../../core/values'
import type { Metric, MetricValue, Tag, TrackerConfig } from '../../core/types'
import type { TrackerApi } from '../../lib/useTracker'
import { FieldInput, dependentIds } from './FieldInput'
import { Sheet } from './Sheet'
import { TagFilter } from './TagFilter'
import { IconCheck, IconChevronLeft } from './Icons'

export interface QuickAddProps {
  tracker: TrackerApi
  config: TrackerConfig
  onClose: () => void
}

/**
 * Below this many choices the list is already scannable, and a filter that
 * hides two entries out of three costs more taps than it saves.
 */
const FILTER_FROM = 6

export function QuickAdd({ tracker, config, onClose }: QuickAddProps) {
  const day = todayISO()
  const roots = quickAddMetrics(config)

  const [rootId, setRootId] = useState<string | null>(null)
  const [answers, setAnswers] = useState<Answers>(new Map())
  const [tag, setTag] = useState<string | null>(null)
  /** Label of the last saved event — the one-line confirmation. */
  const [saved, setSaved] = useState<string | null>(null)

  /** Only the tags the choices actually carry: a filter must be able to filter. */
  const filterTags = config.tags.filter((t) => roots.some((m) => m.tags.includes(t.id)))
  const showFilter = roots.length >= FILTER_FROM && filterTags.length > 1
  const activeTag = showFilter && tag !== null && filterTags.some((t) => t.id === tag) ? tag : null
  const visible = activeTag === null ? roots : roots.filter((m) => m.tags.includes(activeTag))

  const root = rootId === null ? undefined : roots.find((m) => m.id === rootId)
  const fields = root ? buildQuickForm(config, answers, root.id) : []

  /** Seed from what the day already holds, defaulting a boolean root to "Oui". */
  const pick = (metric: Metric) => {
    const seeded: Answers = new Map(tracker.answersFor(day))
    if (metric.type === 'bool' && (seeded.get(metric.id) ?? null) === null) {
      seeded.set(metric.id, true)
    }
    setAnswers(seeded)
    setRootId(metric.id)
    setSaved(null)
  }

  const backToList = () => {
    setRootId(null)
    setAnswers(new Map())
  }

  const change = (metric: Metric, value: MetricValue) => {
    setAnswers((previous) => {
      const next: Answers = new Map(previous)
      next.set(metric.id, value)
      // A follow-up that is no longer revealed must not keep a hidden answer.
      if (!isTruthy(metric, value)) {
        for (const id of dependentIds(config.metrics, metric.id)) next.set(id, null)
      }
      return next
    })
  }

  const submit = () => {
    if (!root) return
    const stored = tracker.answersFor(day)
    for (const [id, value] of answers) {
      const before = stored.get(id) ?? null
      if ((value ?? null) !== before) tracker.setValue(day, id, value)
    }
    setSaved(root.label)
    backToList()
  }

  const footer = root ? (
    <>
      <button type="button" className="btn" onClick={backToList}>
        Annuler
      </button>
      <button type="button" className="btn btn--primary" onClick={submit}>
        Enregistrer
      </button>
    </>
  ) : (
    <button type="button" className="btn btn--block" onClick={onClose}>
      Fermer
    </button>
  )

  return (
    <Sheet title="Ajout rapide" onClose={onClose} footer={footer}>
      <p className="small muted" style={{ margin: 0 }}>
        Enregistré sur aujourd'hui, {formatDayLong(day)}. Pour un autre jour, utilise la navigation
        de l'onglet Aujourd'hui.
      </p>

      {saved && (
        <div className="banner banner--ok" role="status">
          <IconCheck size={18} />
          <span>« {saved} » enregistré. Tu peux en ajouter un autre.</span>
        </div>
      )}

      {root ? (
        <>
          <button type="button" className="btn btn--ghost btn--sm" onClick={backToList}>
            <IconChevronLeft size={16} />
            Changer d'indicateur
          </button>

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
      ) : roots.length === 0 ? (
        <p className="empty">
          Aucun indicateur en ajout rapide. Passe un indicateur en mode « quick » dans ta feuille
          pour le retrouver ici.
        </p>
      ) : (
        <div className="stack stack--tight">
          <p className="field__label" style={{ margin: 0 }}>
            Que veux-tu déclarer ?
          </p>

          {showFilter && <TagFilter tags={filterTags} value={activeTag} onChange={setTag} />}

          {visible.length === 0 ? (
            <p className="field__help">Aucun indicateur ne porte cette étiquette.</p>
          ) : (
            <div className="quick-list">
              {visible.map((metric) => (
                <button
                  key={metric.id}
                  type="button"
                  className="quick-item"
                  onClick={() => pick(metric)}
                >
                  <span className="grow">
                    <span className="quick-item__label">{metric.label}</span>
                    <span className="field__help">{metric.group}</span>
                  </span>
                  <TagDots ids={metric.tags} tags={config.tags} />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </Sheet>
  )
}

function TagDots({ ids, tags }: { ids: string[]; tags: Tag[] }) {
  const found = ids.map((id) => tags.find((t) => t.id === id)).filter((t): t is Tag => !!t)
  if (found.length === 0) return null
  return (
    <span className="dots">
      {found.map((tag) => (
        <span key={tag.id} className="dot" style={{ background: tag.color }} title={tag.label} />
      ))}
    </span>
  )
}
