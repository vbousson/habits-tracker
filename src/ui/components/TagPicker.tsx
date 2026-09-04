/** Multi-select tag chips, shared by notes, events and the metric promotion. */
import { useId } from 'react'
import type { Tag } from '../../core/types'

export interface TagPickerProps {
  tags: Tag[]
  value: string[]
  onChange: (ids: string[]) => void
  label?: string
}

export function TagPicker({ tags, value, onChange, label = 'Étiquettes' }: TagPickerProps) {
  const labelId = useId()
  const selected = new Set(value)

  if (tags.length === 0) {
    return (
      <div className="field">
        <span className="field__label">{label}</span>
        <p className="field__help">Aucune étiquette définie dans la configuration.</p>
      </div>
    )
  }

  return (
    <div className="field">
      <span className="field__label" id={labelId}>
        {label}
      </span>
      <div className="chips chips--plain" role="group" aria-labelledby={labelId}>
        {tags.map((tag) => {
          const on = selected.has(tag.id)
          return (
            <button
              key={tag.id}
              type="button"
              className="chip"
              aria-pressed={on}
              style={on ? { background: tag.color, borderColor: tag.color } : undefined}
              onClick={() =>
                onChange(on ? value.filter((id) => id !== tag.id) : [...value, tag.id])
              }
            >
              {!on && <span className="chip__dot" style={{ background: tag.color }} />}
              {tag.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
