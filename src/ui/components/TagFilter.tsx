/**
 * Single-select tag filter: the control that narrows the whole dashboard to one
 * theme, so "montrer la vue Santé à l'allergologue" is one tap away.
 */
import { ACCENT } from '../../core/colors'
import type { Tag } from '../../core/types'
import '../dashboard.css'

export interface TagFilterProps {
  tags: Tag[]
  /** `null` means "Tout". */
  value: string | null
  onChange: (tag: string | null) => void
}

export function TagFilter({ tags, value, onChange }: TagFilterProps) {
  if (tags.length === 0) return null

  const options: { id: string | null; label: string; color: string }[] = [
    { id: null, label: 'Tout', color: ACCENT },
    ...tags.map((tag) => ({ id: tag.id, label: tag.label, color: tag.color })),
  ]

  return (
    <div className="tagfilter" role="group" aria-label="Filtrer par thème">
      {options.map((option) => {
        const active = option.id === value
        return (
          <button
            key={option.id ?? '__all__'}
            type="button"
            className="chip"
            aria-pressed={active}
            style={active ? { background: option.color } : undefined}
            onClick={() => onChange(option.id)}
          >
            <span
              className="chip__dot"
              style={{ background: active ? 'currentColor' : option.color }}
            />
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
