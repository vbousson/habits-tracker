/** Create or edit a milestone (one day) or a period (a range of days). */
import { useState } from 'react'
import { daysBetween } from '../../core/date'
import type { ISODate, Tag, TrackedEvent } from '../../core/types'
import { Sheet } from './Sheet'
import { TagPicker } from './TagPicker'
import { IconTrash } from './Icons'

export interface EventEditorProps {
  /** `null` creates a new event. */
  event: TrackedEvent | null
  tags: Tag[]
  defaultDate: ISODate
  onSave: (event: TrackedEvent) => void
  onDelete: (id: string) => void
  onClose: () => void
}

export function EventEditor({
  event,
  tags,
  defaultDate,
  onSave,
  onDelete,
  onClose,
}: EventEditorProps) {
  const [label, setLabel] = useState(event?.label ?? '')
  const [start, setStart] = useState<ISODate>(event?.start ?? defaultDate)
  const [end, setEnd] = useState<ISODate>(event?.end ?? defaultDate)
  const [tagIds, setTagIds] = useState<string[]>(event?.tags ?? [])
  const [note, setNote] = useState(event?.note ?? '')

  const inverted = end < start
  const valid = label.trim().length > 0 && !inverted
  const span = daysBetween(start, end) + 1

  const submit = () => {
    if (!valid) return
    onSave({
      id: event?.id ?? crypto.randomUUID(),
      label: label.trim(),
      start,
      end,
      tags: tagIds,
      note: note.trim(),
    })
    onClose()
  }

  const remove = () => {
    if (!event) return
    if (!window.confirm('Supprimer cet événement ?')) return
    onDelete(event.id)
    onClose()
  }

  return (
    <Sheet
      title={event ? "Modifier l'événement" : 'Nouvel événement'}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Annuler
          </button>
          <button type="button" className="btn btn--primary" onClick={submit} disabled={!valid}>
            Enregistrer
          </button>
        </>
      }
    >
      <div className="field">
        <label className="field__label" htmlFor="event-label">
          Intitulé
        </label>
        <input
          id="event-label"
          className="input"
          type="text"
          value={label}
          placeholder="Vacances, rush avant release…"
          onChange={(e) => setLabel(e.target.value)}
        />
      </div>

      <div className="field">
        <label className="field__label" htmlFor="event-start">
          Début
        </label>
        <input
          id="event-start"
          className="input"
          type="date"
          value={start}
          onChange={(e) => {
            const next = e.target.value
            if (!next) return
            setStart(next)
            // A period never starts after it ends: drag the end along.
            if (next > end) setEnd(next)
          }}
        />
      </div>

      <div className="field">
        <label className="field__label" htmlFor="event-end">
          Fin
        </label>
        <input
          id="event-end"
          className="input"
          type="date"
          value={end}
          min={start}
          onChange={(e) => {
            if (e.target.value) setEnd(e.target.value)
          }}
        />
        <p className="field__help">
          {inverted
            ? 'La fin doit être postérieure au début.'
            : span === 1
              ? 'Événement sur une seule journée.'
              : `Période de ${span} jours.`}
        </p>
      </div>

      <TagPicker tags={tags} value={tagIds} onChange={setTagIds} />

      <div className="field">
        <label className="field__label" htmlFor="event-note">
          Note
        </label>
        <textarea
          id="event-note"
          className="textarea"
          rows={3}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>

      {event && (
        <button type="button" className="btn btn--danger btn--block" onClick={remove}>
          <IconTrash size={16} />
          Supprimer l'événement
        </button>
      )}
    </Sheet>
  )
}
