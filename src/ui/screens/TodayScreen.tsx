/**
 * The evening screen: one day, the questions due for it, nothing else.
 *
 * The form is re-derived from the live answers on every change, so answering a
 * parent "Oui" reveals its follow-ups instantly, and clearing it hides them
 * again — dropping their answers rather than leaving them orphaned in the sheet.
 */
import { useState } from 'react'
import { addDays, formatDayLong, relativeDayLabel, todayISO } from '../../core/date'
import { buildDailyForm, formProgress, quickAddMetrics } from '../../core/form'
import { isTruthy } from '../../core/values'
import type { Metric, MetricValue } from '../../core/types'
import { FieldInput, dependentIds } from '../components/FieldInput'
import { QuickAdd } from '../components/QuickAdd'
import {
  IconCheck,
  IconChevronLeft,
  IconChevronRight,
  IconPlus,
  IconRefresh,
} from '../components/Icons'
import type { ScreenProps } from './types'
import '../form.css'

export function TodayScreen({ tracker }: ScreenProps) {
  const today = todayISO()
  const [date, setDate] = useState(today)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [quickOpen, setQuickOpen] = useState(false)

  const snapshot = tracker.snapshot

  if (!snapshot) {
    if (tracker.status === 'error') {
      return (
        <div className="stack">
          <div className="banner banner--error">
            <span className="grow">{tracker.error ?? 'Chargement impossible.'}</span>
          </div>
          <button type="button" className="btn btn--block" onClick={() => void tracker.reload()}>
            <IconRefresh size={17} />
            Réessayer
          </button>
        </div>
      )
    }
    return (
      <div className="empty">
        <span className="spinner" />
        <span>Chargement…</span>
      </div>
    )
  }

  const config = snapshot.config
  const answers = tracker.answersFor(date)
  const sections = buildDailyForm(config, date, answers)
  const progress = formProgress(sections)
  const complete = progress.total > 0 && progress.answered === progress.total
  const hasQuickAdd = quickAddMetrics(config).length > 0

  const change = (metric: Metric, value: MetricValue) => {
    tracker.setValue(date, metric.id, value)
    if (!isTruthy(metric, value)) {
      for (const id of dependentIds(config.metrics, metric.id)) {
        if ((answers.get(id) ?? null) !== null) tracker.setValue(date, id, null)
      }
    }
  }

  return (
    <div className="stack screen">
      <div className="card day-nav">
        <button
          type="button"
          className="btn btn--ghost btn--icon"
          onClick={() => setDate(addDays(date, -1))}
          aria-label="Jour précédent"
        >
          <IconChevronLeft size={20} />
        </button>
        <button
          type="button"
          className="day-nav__label grow"
          aria-expanded={pickerOpen}
          onClick={() => setPickerOpen((open) => !open)}
        >
          <span className="day-nav__rel">{relativeDayLabel(date, today)}</span>
          <span className="day-nav__date small muted">{formatDayLong(date)}</span>
        </button>
        <button
          type="button"
          className="btn btn--ghost btn--icon"
          onClick={() => setDate(addDays(date, 1))}
          disabled={date >= today}
          aria-label="Jour suivant"
        >
          <IconChevronRight size={20} />
        </button>
      </div>

      {pickerOpen && (
        <div className="card stack stack--tight">
          <label className="field__label" htmlFor="today-date">
            Aller à un jour
          </label>
          <input
            id="today-date"
            className="input"
            type="date"
            value={date}
            max={today}
            onChange={(e) => {
              if (!e.target.value || e.target.value > today) return
              setDate(e.target.value)
              setPickerOpen(false)
            }}
          />
          {date !== today && (
            <button
              type="button"
              className="btn btn--block"
              onClick={() => {
                setDate(today)
                setPickerOpen(false)
              }}
            >
              Revenir à aujourd'hui
            </button>
          )}
        </div>
      )}

      {tracker.error && (
        <div className="banner banner--error">
          <span className="grow">{tracker.error}</span>
          <button type="button" className="btn btn--sm" onClick={() => void tracker.flush()}>
            <IconRefresh size={15} />
            Réessayer
          </button>
        </div>
      )}

      {progress.total > 0 && (
        <div className="stack stack--tight">
          <div className="row row--between">
            <span className="small muted numeric">
              {progress.answered} / {progress.total} répondu
            </span>
            <SaveState saving={tracker.saving} lastSavedAt={tracker.lastSavedAt} />
          </div>
          <div
            className="progress"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={progress.total}
            aria-valuenow={progress.answered}
            aria-label="Progression du jour"
          >
            <div className="progress__bar" style={{ width: `${Math.round(progress.ratio * 100)}%` }} />
          </div>
        </div>
      )}

      {complete && (
        <div className="banner banner--ok">
          <IconCheck size={18} />
          <span>Journée complète — tout est renseigné.</span>
        </div>
      )}

      {config.metrics.length === 0 ? (
        <div className="empty">
          <strong>Aucun indicateur configuré.</strong>
          <span>
            Crée ta feuille de suivi depuis l'onglet Réglages, puis reviens ici : les questions
            viennent de ta configuration, pas de l'application.
          </span>
        </div>
      ) : sections.length === 0 ? (
        <div className="empty">
          <strong>Rien à renseigner ce jour-là.</strong>
          <span>Aucun indicateur n'est programmé pour cette date.</span>
        </div>
      ) : (
        sections.map((section) => (
          <section key={section.group} className="card stack">
            <h2 className="section-title">{section.group}</h2>
            <div className="form-section">
              {section.fields.map((field) => (
                <FieldInput
                  key={field.metric.id}
                  field={field}
                  onChange={(value) => change(field.metric, value)}
                />
              ))}
            </div>
          </section>
        ))
      )}

      {hasQuickAdd && (
        <button type="button" className="fab" onClick={() => setQuickOpen(true)}>
          <IconPlus size={19} />
          Ajout rapide
        </button>
      )}

      {quickOpen && (
        <QuickAdd
          tracker={tracker}
          config={config}
          date={date}
          onClose={() => setQuickOpen(false)}
        />
      )}
    </div>
  )
}

function SaveState({ saving, lastSavedAt }: { saving: boolean; lastSavedAt: number | null }) {
  if (saving) {
    return (
      <span className="savestate" aria-live="polite">
        <span className="spinner" />
        Enregistrement…
      </span>
    )
  }
  if (lastSavedAt === null) return null
  return (
    <span className="savestate savestate--ok" aria-live="polite">
      <IconCheck size={14} />
      Enregistré
    </span>
  )
}
