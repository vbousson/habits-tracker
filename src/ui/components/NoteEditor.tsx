/** Create or edit a free-form journal note. */
import { useState } from 'react'
import { todayISO } from '../../core/date'
import type { ISODate, Note, Tag } from '../../core/types'
import { Sheet } from './Sheet'
import { TagPicker } from './TagPicker'
import { IconTrash } from './Icons'

export interface NoteEditorProps {
  /** `null` creates a new note. */
  note: Note | null
  tags: Tag[]
  defaultDate: ISODate
  onSave: (note: Note) => void
  onDelete: (id: string) => void
  onClose: () => void
}

export function NoteEditor({ note, tags, defaultDate, onSave, onDelete, onClose }: NoteEditorProps) {
  const [date, setDate] = useState<ISODate>(note?.date ?? defaultDate)
  const [tagIds, setTagIds] = useState<string[]>(note?.tags ?? [])
  const [text, setText] = useState(note?.text ?? '')

  const valid = text.trim().length > 0

  const submit = () => {
    if (!valid) return
    onSave({
      id: note?.id ?? crypto.randomUUID(),
      date,
      tags: tagIds,
      text: text.trim(),
      createdAt: note?.createdAt ?? new Date().toISOString(),
    })
    onClose()
  }

  const remove = () => {
    if (!note) return
    if (!window.confirm('Supprimer cette note ?')) return
    onDelete(note.id)
    onClose()
  }

  return (
    <Sheet
      title={note ? 'Modifier la note' : 'Nouvelle note'}
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
        <label className="field__label" htmlFor="note-date">
          Jour
        </label>
        <input
          id="note-date"
          className="input"
          type="date"
          value={date}
          max={todayISO()}
          onChange={(e) => {
            if (e.target.value) setDate(e.target.value)
          }}
        />
      </div>

      <TagPicker tags={tags} value={tagIds} onChange={setTagIds} />

      <div className="field">
        <label className="field__label" htmlFor="note-text">
          Note
        </label>
        <textarea
          id="note-text"
          className="textarea"
          rows={4}
          value={text}
          placeholder="Ce que tu veux retenir de cette journée…"
          onChange={(e) => setText(e.target.value)}
        />
      </div>

      {note && (
        <button type="button" className="btn btn--danger btn--block" onClick={remove}>
          <IconTrash size={16} />
          Supprimer la note
        </button>
      )}
    </Sheet>
  )
}
