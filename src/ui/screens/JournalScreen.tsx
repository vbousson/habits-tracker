/**
 * The journal: free-form notes on one side, milestones and periods on the other.
 *
 * Notes are the low-friction capture channel — anything that does not deserve a
 * metric yet. When one of them turns out to recur, "Suivre comme indicateur"
 * promotes it into a real tracked metric that shows up in the daily form.
 */
import { useState } from 'react'
import { formatDayLong, relativeDayLabel, todayISO } from '../../core/date'
import type { ISODate, Metric, MetricType, Note, Tag, TrackedEvent } from '../../core/types'
import { EventEditor } from '../components/EventEditor'
import { NoteEditor } from '../components/NoteEditor'
import { Sheet } from '../components/Sheet'
import { TagPicker } from '../components/TagPicker'
import { IconPlus, IconRefresh, IconTrash } from '../components/Icons'
import type { ScreenProps } from './types'
import '../form.css'

type Tab = 'notes' | 'events'

export function JournalScreen({ tracker }: ScreenProps) {
  const [tab, setTab] = useState<Tab>('notes')
  const [filter, setFilter] = useState<string[]>([])
  const [noteEdit, setNoteEdit] = useState<{ note: Note | null } | null>(null)
  const [eventEdit, setEventEdit] = useState<{ event: TrackedEvent | null } | null>(null)
  const [promoting, setPromoting] = useState<Note | null>(null)

  const snapshot = tracker.snapshot
  const today = todayISO()

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

  const tags = snapshot.config.tags
  const matches = (ids: string[]) => filter.length === 0 || ids.some((id) => filter.includes(id))

  const notes = snapshot.notes
    .filter((note) => matches(note.tags))
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))

  const events = snapshot.events
    .filter((event) => matches(event.tags))
    .sort((a, b) => b.start.localeCompare(a.start) || a.label.localeCompare(b.label))

  const days: { date: ISODate; notes: Note[] }[] = []
  for (const note of notes) {
    const last = days[days.length - 1]
    if (last && last.date === note.date) last.notes.push(note)
    else days.push({ date: note.date, notes: [note] })
  }

  return (
    <div className="stack screen">
      <div className="segmented" role="group" aria-label="Section du journal">
        <button
          type="button"
          className="segmented__opt"
          aria-pressed={tab === 'notes'}
          onClick={() => setTab('notes')}
        >
          Notes
        </button>
        <button
          type="button"
          className="segmented__opt"
          aria-pressed={tab === 'events'}
          onClick={() => setTab('events')}
        >
          Événements
        </button>
      </div>

      {tags.length > 0 && (
        <TagPicker tags={tags} value={filter} onChange={setFilter} label="Filtrer par étiquette" />
      )}

      {tracker.error && (
        <div className="banner banner--error">
          <span className="grow">{tracker.error}</span>
        </div>
      )}

      {tab === 'notes' &&
        (days.length === 0 ? (
          <div className="empty">
            <strong>Aucune note.</strong>
            <span>
              {filter.length > 0
                ? 'Aucune note ne porte les étiquettes sélectionnées.'
                : 'Note ici ce qui ne mérite pas encore un indicateur.'}
            </span>
          </div>
        ) : (
          days.map((day) => (
            <section key={day.date} className="day-group">
              <h2 className="section-title">
                {formatDayLong(day.date)}
                <span className="faint">{relativeDayLabel(day.date, today)}</span>
              </h2>
              {day.notes.map((note) => (
                <article key={note.id} className="entry">
                  <p className="entry__text">{note.text}</p>
                  <TagMarks ids={note.tags} tags={tags} />
                  <div className="entry__actions">
                    <button
                      type="button"
                      className="btn btn--sm"
                      onClick={() => setNoteEdit({ note })}
                    >
                      Modifier
                    </button>
                    <button
                      type="button"
                      className="btn btn--sm"
                      onClick={() => setPromoting(note)}
                    >
                      Suivre comme indicateur
                    </button>
                    <button
                      type="button"
                      className="btn btn--sm btn--danger"
                      aria-label="Supprimer la note"
                      onClick={() => {
                        if (window.confirm('Supprimer cette note ?')) {
                          void tracker.deleteNote(note.id)
                        }
                      }}
                    >
                      <IconTrash size={15} />
                    </button>
                  </div>
                </article>
              ))}
            </section>
          ))
        ))}

      {tab === 'events' &&
        (events.length === 0 ? (
          <div className="empty">
            <strong>Aucun événement.</strong>
            <span>
              {filter.length > 0
                ? 'Aucun événement ne porte les étiquettes sélectionnées.'
                : 'Enregistre les périodes qui expliquent les courbes : vacances, rush, traitement.'}
            </span>
          </div>
        ) : (
          events.map((event) => (
            <article key={event.id} className="entry">
              <strong>{event.label}</strong>
              <span className="small muted">{rangeLabel(event)}</span>
              {event.note && <p className="entry__text small">{event.note}</p>}
              <TagMarks ids={event.tags} tags={tags} />
              <div className="entry__actions">
                <button type="button" className="btn btn--sm" onClick={() => setEventEdit({ event })}>
                  Modifier
                </button>
                <button
                  type="button"
                  className="btn btn--sm btn--danger"
                  aria-label="Supprimer l'événement"
                  onClick={() => {
                    if (window.confirm('Supprimer cet événement ?')) {
                      void tracker.deleteEvent(event.id)
                    }
                  }}
                >
                  <IconTrash size={15} />
                </button>
              </div>
            </article>
          ))
        ))}

      <button
        type="button"
        className="fab"
        onClick={() => (tab === 'notes' ? setNoteEdit({ note: null }) : setEventEdit({ event: null }))}
      >
        <IconPlus size={19} />
        {tab === 'notes' ? 'Nouvelle note' : 'Nouvel événement'}
      </button>

      {noteEdit && (
        <NoteEditor
          note={noteEdit.note}
          tags={tags}
          defaultDate={today}
          onSave={(note) => void tracker.saveNote(note)}
          onDelete={(id) => void tracker.deleteNote(id)}
          onClose={() => setNoteEdit(null)}
        />
      )}

      {eventEdit && (
        <EventEditor
          event={eventEdit.event}
          tags={tags}
          defaultDate={today}
          onSave={(event) => void tracker.saveEvent(event)}
          onDelete={(id) => void tracker.deleteEvent(id)}
          onClose={() => setEventEdit(null)}
        />
      )}

      {promoting && (
        <PromoteNote
          note={promoting}
          tags={tags}
          existing={snapshot.config.metrics}
          onCreate={(metric) => void tracker.addMetric(metric)}
          onClose={() => setPromoting(null)}
        />
      )}
    </div>
  )
}

function TagMarks({ ids, tags }: { ids: string[]; tags: Tag[] }) {
  if (ids.length === 0) return null
  return (
    <div className="row row--wrap">
      {ids.map((id) => {
        const tag = tags.find((t) => t.id === id)
        return (
          <span key={id} className="tagmark">
            <span className="dot" style={{ background: tag?.color ?? 'var(--text-faint)' }} />
            {tag?.label ?? id}
          </span>
        )
      })}
    </div>
  )
}

function rangeLabel(event: TrackedEvent): string {
  if (event.start === event.end) return formatDayLong(event.start)
  return `du ${formatDayLong(event.start)} au ${formatDayLong(event.end)}`
}

/* --- Promoting a note into a metric ---------------------------------------- */

const TYPE_LABELS: { value: MetricType; label: string }[] = [
  { value: 'bool', label: 'Oui / Non' },
  { value: 'scale', label: 'Échelle' },
  { value: 'choice', label: 'Choix' },
  { value: 'number', label: 'Nombre' },
  { value: 'text', label: 'Texte libre' },
]

/** ASCII snake_case, diacritics stripped, safe as a spreadsheet key. */
export function slugify(text: string): string {
  const base = text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40)
    .replace(/_+$/g, '')
  return base === '' ? 'indicateur' : /^[0-9]/.test(base) ? `m_${base}` : base
}

/** Same alphabet as `slugify`, but tolerant of a trailing "_" being typed. */
function sanitizeId(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .slice(0, 40)
}

function uniqueId(base: string, taken: Set<string>): string {
  if (!taken.has(base)) return base
  for (let n = 2; n < 100; n += 1) {
    const candidate = `${base}_${n}`
    if (!taken.has(candidate)) return candidate
  }
  return `${base}_${Date.now()}`
}

interface PromoteNoteProps {
  note: Note
  tags: Tag[]
  existing: Metric[]
  onCreate: (metric: Metric) => void
  onClose: () => void
}

function PromoteNote({ note, tags, existing, onCreate, onClose }: PromoteNoteProps) {
  const taken = new Set(existing.map((m) => m.id))
  const firstLine = note.text.split('\n')[0] ?? note.text

  const [label, setLabel] = useState(firstLine.slice(0, 60).trim())
  const [id, setId] = useState(() => uniqueId(slugify(firstLine), taken))
  const [type, setType] = useState<MetricType>('bool')
  const [options, setOptions] = useState('Faible, Moyen, Fort')
  const [group, setGroup] = useState(
    tags.find((t) => note.tags.includes(t.id))?.label ?? 'Journal',
  )
  const [tagIds, setTagIds] = useState<string[]>(note.tags)

  const needsOptions = type === 'scale' || type === 'choice'
  const parsedOptions = options
    .split(',')
    .map((option) => option.trim())
    .filter((option) => option !== '')

  const idValid = /^[a-z][a-z0-9_]*$/.test(id)
  const collides = taken.has(id)
  const valid =
    idValid && !collides && label.trim() !== '' && (!needsOptions || parsedOptions.length >= 2)

  const submit = () => {
    if (!valid) return
    const order = existing.reduce((max, metric) => Math.max(max, metric.order), 0) + 10
    onCreate({
      id,
      label: label.trim(),
      type,
      options: needsOptions ? parsedOptions : [],
      tags: tagIds,
      group: group.trim() || 'Journal',
      schedule: { days: [0, 1, 2, 3, 4, 5, 6], raw: 'daily' },
      mode: 'daily',
      order,
      active: true,
      help: `Créé depuis une note du ${note.date}.`,
    })
    onClose()
  }

  return (
    <Sheet
      title="Suivre comme indicateur"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Annuler
          </button>
          <button type="button" className="btn btn--primary" onClick={submit} disabled={!valid}>
            Créer l'indicateur
          </button>
        </>
      }
    >
      <p className="small muted">
        L'indicateur sera ajouté à ta configuration et proposé tous les jours. La note, elle, reste
        telle quelle.
      </p>

      <div className="field">
        <label className="field__label" htmlFor="promote-label">
          Libellé
        </label>
        <input
          id="promote-label"
          className="input"
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
      </div>

      <div className="field">
        <label className="field__label" htmlFor="promote-id">
          Identifiant
        </label>
        <input
          id="promote-id"
          className="input"
          type="text"
          value={id}
          onChange={(e) => setId(sanitizeId(e.target.value))}
        />
        <p className="field__help">
          {collides
            ? 'Cet identifiant est déjà utilisé par un autre indicateur.'
            : idValid
              ? 'Minuscules, chiffres et tirets bas. Il ne pourra plus changer ensuite.'
              : "Identifiant invalide : commence par une lettre, sans accent ni espace."}
        </p>
      </div>

      <div className="field">
        <label className="field__label" htmlFor="promote-type">
          Type de réponse
        </label>
        <select
          id="promote-type"
          className="select"
          value={type}
          onChange={(e) => setType(e.target.value as MetricType)}
        >
          {TYPE_LABELS.map((entry) => (
            <option key={entry.value} value={entry.value}>
              {entry.label}
            </option>
          ))}
        </select>
      </div>

      {needsOptions && (
        <div className="field">
          <label className="field__label" htmlFor="promote-options">
            Réponses possibles
          </label>
          <input
            id="promote-options"
            className="input"
            type="text"
            value={options}
            onChange={(e) => setOptions(e.target.value)}
          />
          <p className="field__help">
            Séparées par des virgules, de la plus faible à la plus forte. Deux au minimum.
          </p>
        </div>
      )}

      <div className="field">
        <label className="field__label" htmlFor="promote-group">
          Section
        </label>
        <input
          id="promote-group"
          className="input"
          type="text"
          value={group}
          onChange={(e) => setGroup(e.target.value)}
        />
      </div>

      <TagPicker tags={tags} value={tagIds} onChange={setTagIds} />
    </Sheet>
  )
}
