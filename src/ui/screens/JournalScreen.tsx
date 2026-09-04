/**
 * The journal: one reverse-chronological timeline, notes and events together.
 *
 * They used to sit behind a switch, which was wrong twice over — a note and an
 * event on the same evening are the same memory, and having to guess which tab
 * something was filed under is exactly the friction that stops a journal being
 * kept. So: one list, grouped by day, newest first, events and notes
 * interleaved, one tag filter over both.
 *
 * **Where a multi-day event sits.** Under its *start* day, rendered as a range.
 * An event is an anchor and its beginning is what dates it: repeating "vacances"
 * across fifteen day-groups would bury everything else, and filing it under its
 * end would hide something that has already started. One still running carries
 * an "en cours" badge, so an open period is identifiable without hunting for it.
 *
 * Notes are also the low-friction capture channel — anything that does not
 * deserve a metric yet. When one of them turns out to recur, "Suivre comme
 * indicateur" promotes it into a real tracked metric.
 */
import { useMemo, useState } from 'react'
import { formatDayLong, formatMonth, relativeDayLabel, todayISO } from '../../core/date'
import type { ISODate, Metric, MetricType, Note, Tag, TrackedEvent } from '../../core/types'
import { EventEditor } from '../components/EventEditor'
import { NoteEditor } from '../components/NoteEditor'
import { Sheet } from '../components/Sheet'
import { TagPicker } from '../components/TagPicker'
import { IconJournal, IconPlus, IconRefresh, IconTrash } from '../components/Icons'
import type { ScreenProps } from './types'
import '../form.css'

/** Day groups rendered before the "voir plus" button; roughly one screenful × 8. */
const PAGE = 40

type Item =
  | { kind: 'event'; date: ISODate; sort: string; event: TrackedEvent }
  | { kind: 'note'; date: ISODate; sort: string; note: Note }

interface DayGroup {
  date: ISODate
  items: Item[]
}

/** Newest day first; inside a day, events set the context so they come first. */
function groupByDay(notes: Note[], events: TrackedEvent[]): DayGroup[] {
  const items: Item[] = [
    ...events.map<Item>((event) => ({
      kind: 'event',
      date: event.start,
      sort: `0-${event.label}`,
      event,
    })),
    ...notes.map<Item>((note) => ({
      kind: 'note',
      date: note.date,
      sort: `1-${note.createdAt}`,
      note,
    })),
  ]
  items.sort((a, b) => b.date.localeCompare(a.date) || b.sort.localeCompare(a.sort))

  const days: DayGroup[] = []
  for (const item of items) {
    const last = days[days.length - 1]
    if (last && last.date === item.date) last.items.push(item)
    else days.push({ date: item.date, items: [item] })
  }
  return days
}

export function JournalScreen({ tracker }: ScreenProps) {
  const [filter, setFilter] = useState<string[]>([])
  const [limit, setLimit] = useState(PAGE)
  const [adding, setAdding] = useState(false)
  const [noteEdit, setNoteEdit] = useState<{ note: Note | null } | null>(null)
  const [eventEdit, setEventEdit] = useState<{ event: TrackedEvent | null } | null>(null)
  const [promoting, setPromoting] = useState<Note | null>(null)

  const snapshot = tracker.snapshot
  const today = todayISO()

  const days = useMemo(() => {
    if (!snapshot) return []
    const matches = (ids: string[]) => filter.length === 0 || ids.some((id) => filter.includes(id))
    return groupByDay(
      snapshot.notes.filter((note) => matches(note.tags)),
      snapshot.events.filter((event) => matches(event.tags)),
    )
  }, [snapshot, filter])

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
  const shown = days.slice(0, limit)

  return (
    <div className="stack screen">
      {tags.length > 0 && (
        <TagPicker tags={tags} value={filter} onChange={setFilter} label="Filtrer par étiquette" />
      )}

      {tracker.error && (
        <div className="banner banner--error">
          <span className="grow">{tracker.error}</span>
        </div>
      )}

      {days.length === 0 ? (
        <div className="empty">
          <strong>Journal vide.</strong>
          <span>
            {filter.length > 0
              ? 'Aucune note ni événement ne porte les étiquettes sélectionnées.'
              : "Note ici ce qui ne mérite pas encore un indicateur, et enregistre les périodes qui expliquent les courbes : vacances, rush, traitement."}
          </span>
        </div>
      ) : (
        shown.map((day, index) => (
          <section key={day.date} className="day-group">
            {day.date.slice(0, 7) !== shown[index - 1]?.date.slice(0, 7) && (
              <h2 className="timeline__month">{formatMonth(day.date)}</h2>
            )}
            <h3 className="section-title">
              {formatDayLong(day.date)}
              {/* Only when it *is* relative: `relativeDayLabel` falls back to the
                  full date, which would print the heading twice. */}
              {relative(day.date, today) && <span className="faint">{relative(day.date, today)}</span>}
            </h3>
            {day.items.map((item) =>
              item.kind === 'event' ? (
                <EventRow
                  key={item.event.id}
                  event={item.event}
                  tags={tags}
                  today={today}
                  onEdit={() => setEventEdit({ event: item.event })}
                  onDelete={() => {
                    if (window.confirm('Supprimer cet événement ?')) {
                      void tracker.deleteEvent(item.event.id)
                    }
                  }}
                />
              ) : (
                <NoteRow
                  key={item.note.id}
                  note={item.note}
                  tags={tags}
                  onEdit={() => setNoteEdit({ note: item.note })}
                  onPromote={() => setPromoting(item.note)}
                  onDelete={() => {
                    if (window.confirm('Supprimer cette note ?')) {
                      void tracker.deleteNote(item.note.id)
                    }
                  }}
                />
              ),
            )}
          </section>
        ))
      )}

      {days.length > shown.length && (
        <button type="button" className="btn btn--block" onClick={() => setLimit(limit + PAGE)}>
          Afficher plus ({days.length - shown.length} jours restants)
        </button>
      )}

      <button type="button" className="fab" onClick={() => setAdding(true)}>
        <IconPlus size={19} />
        Ajouter
      </button>

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

/* --- Rows ------------------------------------------------------------------ */

/**
 * "Note or event?", shared with the day screen so both offer a single
 * "Ajouter" affordance rather than two half-buttons.
 */
export function AddPicker({
  onPick,
  onClose,
}: {
  onPick: (kind: 'note' | 'event') => void
  onClose: () => void
}) {
  return (
    <Sheet title="Ajouter au journal" onClose={onClose}>
      <div className="quick-list">
        <button type="button" className="quick-item" onClick={() => onPick('note')}>
          <IconJournal size={20} />
          <span className="grow">
            <span className="quick-item__label">Une note</span>
            <span className="field__help">Ce que tu veux retenir de la journée.</span>
          </span>
        </button>
        <button type="button" className="quick-item" onClick={() => onPick('event')}>
          <IconPlus size={20} />
          <span className="grow">
            <span className="quick-item__label">Un événement</span>
            <span className="field__help">
              Une date ou une période : vacances, rush, traitement.
            </span>
          </span>
        </button>
      </div>
    </Sheet>
  )
}

/** Long text stays a row, not a wall; the full text is one tap away. */
function ClampedText({ text }: { text: string }) {
  const [open, setOpen] = useState(false)
  const long = text.length > 260 || text.split('\n').length > 6
  return (
    <>
      <p className={long && !open ? 'entry__text entry__text--clamp' : 'entry__text'}>{text}</p>
      {long && (
        <button type="button" className="field__clear" onClick={() => setOpen(!open)}>
          {open ? 'Réduire' : 'Voir tout'}
        </button>
      )}
    </>
  )
}

export function NoteRow({
  note,
  tags,
  onEdit,
  onPromote,
  onDelete,
}: {
  note: Note
  tags: Tag[]
  onEdit: () => void
  onPromote: () => void
  onDelete: () => void
}) {
  return (
    <article className="entry entry--note">
      <ClampedText text={note.text} />
      <TagMarks ids={note.tags} tags={tags} />
      <div className="entry__actions">
        <button type="button" className="btn btn--sm" onClick={onEdit}>
          Modifier
        </button>
        <button type="button" className="btn btn--sm" onClick={onPromote}>
          Suivre comme indicateur
        </button>
        <button
          type="button"
          className="btn btn--sm btn--danger"
          aria-label="Supprimer la note"
          onClick={onDelete}
        >
          <IconTrash size={15} />
        </button>
      </div>
    </article>
  )
}

export function EventRow({
  event,
  tags,
  today,
  onEdit,
  onDelete,
}: {
  event: TrackedEvent
  tags: Tag[]
  today: ISODate
  onEdit: () => void
  onDelete: () => void
}) {
  const ongoing = event.start <= today && event.end >= today && event.start !== event.end
  return (
    <article className="entry entry--event">
      <div className="row">
        <strong className="grow">{event.label}</strong>
        <span className="badge">{ongoing ? 'en cours' : 'événement'}</span>
      </div>
      <span className="small muted">{rangeLabel(event)}</span>
      {event.note && <ClampedText text={event.note} />}
      <TagMarks ids={event.tags} tags={tags} />
      <div className="entry__actions">
        <button type="button" className="btn btn--sm" onClick={onEdit}>
          Modifier
        </button>
        <button
          type="button"
          className="btn btn--sm btn--danger"
          aria-label="Supprimer l'événement"
          onClick={onDelete}
        >
          <IconTrash size={15} />
        </button>
      </div>
    </article>
  )
}

export function TagMarks({ ids, tags }: { ids: string[]; tags: Tag[] }) {
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

/** "aujourd'hui" / "hier", or nothing at all for a plain past date. */
function relative(date: ISODate, today: ISODate): string | null {
  const label = relativeDayLabel(date, today)
  return label === formatDayLong(date) ? null : label
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
      colors: [],
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
