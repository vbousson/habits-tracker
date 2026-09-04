/**
 * The evening screen: one day and the questions due for it.
 *
 * The form is re-derived from the live answers on every change, so answering a
 * parent "Oui" reveals its follow-ups instantly, and clearing it hides them
 * again — dropping their answers rather than leaving them orphaned in the sheet.
 *
 * It closes with that day's notes and events. This screen is already anchored
 * to a date, so needing to switch tabs to read or add the line that explains the
 * day was pure friction. It stays a *summary*: the full timeline, the tag filter
 * and the promotion action live in the journal.
 */
import { useState } from 'react'
import { addDays, formatDayLong, relativeDayLabel, todayISO } from '../../core/date'
import { buildDailyForm, formProgress, quickAddMetrics } from '../../core/form'
import { isTruthy } from '../../core/values'
import type { ISODate, Metric, MetricValue, Note, Snapshot, TrackedEvent } from '../../core/types'
import { FieldInput, dependentIds } from '../components/FieldInput'
import { QuickAdd } from '../components/QuickAdd'
import { EventEditor } from '../components/EventEditor'
import { NoteEditor } from '../components/NoteEditor'
import { AddPicker } from './JournalScreen'
import {
  IconCheck,
  IconChevronLeft,
  IconChevronRight,
  IconPlus,
  IconRefresh,
} from '../components/Icons'
import { CatchUpBanner } from '../components/CatchUpBanner'
import { GoalsPanel } from '../components/GoalsPanel'
import { useFillTimer } from '../../lib/useFillTimer'
import type { ScreenProps } from './types'
import '../form.css'

export function TodayScreen({ tracker }: ScreenProps) {
  const today = todayISO()
  const [date, setDate] = useState(today)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [quickOpen, setQuickOpen] = useState(false)
  const [adding, setAdding] = useState(false)
  const [noteEdit, setNoteEdit] = useState<{ note: Note | null } | null>(null)
  const [eventEdit, setEventEdit] = useState<{ event: TrackedEvent | null } | null>(null)

  // Measures how long this day takes to fill in. Inert when the spreadsheet has
  // no `duree_saisie` row, which a user is free to delete.
  useFillTimer(tracker, date)

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

      <CatchUpBanner config={config} entries={snapshot.entries} onPick={setDate} today={today} />

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

      {/* Feedback, so it sits *after* the form: seeing the week's standing is
          motivating, but it must never delay the two minutes of actual input. */}
      <GoalsPanel
        config={config}
        entries={snapshot.entries}
        date={date}
        today={today}
        variant="compact"
      />

      <DayJournal
        snapshot={snapshot}
        date={date}
        onAdd={() => setAdding(true)}
        onEditNote={(note) => setNoteEdit({ note })}
        onEditEvent={(event) => setEventEdit({ event })}
      />

      {hasQuickAdd && (
        <button type="button" className="fab" onClick={() => setQuickOpen(true)}>
          <IconPlus size={19} />
          Ajout rapide
        </button>
      )}

      {quickOpen && <QuickAdd tracker={tracker} config={config} onClose={() => setQuickOpen(false)} />}

      {adding && (
        <AddPicker
          onClose={() => setAdding(false)}
          onPick={(kind) => {
            setAdding(false)
            if (kind === 'note') setNoteEdit({ note: null })
            else setEventEdit({ event: null })
          }}
        />
      )}

      {noteEdit && (
        <NoteEditor
          note={noteEdit.note}
          tags={config.tags}
          defaultDate={date}
          onSave={(note) => void tracker.saveNote(note)}
          onDelete={(id) => void tracker.deleteNote(id)}
          onClose={() => setNoteEdit(null)}
        />
      )}

      {eventEdit && (
        <EventEditor
          event={eventEdit.event}
          tags={config.tags}
          defaultDate={date}
          onSave={(event) => void tracker.saveEvent(event)}
          onDelete={(id) => void tracker.deleteEvent(id)}
          onClose={() => setEventEdit(null)}
        />
      )}
    </div>
  )
}

interface DayJournalProps {
  snapshot: Snapshot
  date: ISODate
  onAdd: () => void
  onEditNote: (note: Note) => void
  onEditEvent: (event: TrackedEvent) => void
}

/**
 * That day's notes and the events covering it, as one compact list.
 *
 * An event is shown on every day it spans, not only on the day it started:
 * here the question is "what was going on *that* day", which is the opposite of
 * the journal's, where a period is filed once under its beginning.
 */
function DayJournal({ snapshot, date, onAdd, onEditNote, onEditEvent }: DayJournalProps) {
  const notes = snapshot.notes
    .filter((note) => note.date === date)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const events = snapshot.events
    .filter((event) => event.start <= date && event.end >= date)
    .sort((a, b) => a.label.localeCompare(b.label))

  return (
    <section className="card stack stack--tight">
      <div className="row">
        <h2 className="section-title grow">Notes et événements</h2>
        <button type="button" className="btn btn--sm" onClick={onAdd}>
          <IconPlus size={15} />
          Ajouter
        </button>
      </div>

      {notes.length === 0 && events.length === 0 ? (
        <p className="field__help" style={{ margin: 0 }}>
          Rien pour ce jour-là. Une note suffit souvent à expliquer une courbe six mois plus tard.
        </p>
      ) : (
        <div className="daylog">
          {events.map((event) => (
            <button
              key={event.id}
              type="button"
              className="daylog__row daylog__row--event"
              onClick={() => onEditEvent(event)}
            >
              <span className="grow truncate">{event.label}</span>
              <span className="badge">
                {event.start === event.end ? 'événement' : 'période'}
              </span>
            </button>
          ))}
          {notes.map((note) => (
            <button
              key={note.id}
              type="button"
              className="daylog__row daylog__row--note"
              onClick={() => onEditNote(note)}
            >
              <span className="grow truncate">{note.text}</span>
            </button>
          ))}
        </div>
      )}
    </section>
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
