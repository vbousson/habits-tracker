/**
 * Renders any `Metric` from its declared type — the single place in the UI that
 * knows what a `bool`, `scale`, `choice`, `number` or `text` question looks
 * like. Visibility and ordering are decided by `core/form`; this component only
 * draws one question and reports the new value.
 *
 * `null` (not answered) and `false` (answered "Non") are different values in the
 * data model, so they are drawn differently: an untouched control keeps a dashed
 * outline and no pressed option, an answered one is solid and carries a check.
 */
import { useId, useState } from 'react'
import type { ReactNode } from 'react'
import type { FormField } from '../../core/form'
import type { Metric, MetricValue } from '../../core/types'
import { IconCheck } from './Icons'

export interface FieldInputProps {
  field: FormField
  onChange: (value: MetricValue) => void
}

/** Above this many labels, a `choice` reads better as a native select. */
const CHIP_LIMIT = 6

/**
 * Every metric transitively revealed by `parentId`.
 * Used to drop orphaned answers when a parent stops being truthy.
 */
export function dependentIds(metrics: Metric[], parentId: string): string[] {
  const out: string[] = []
  const queue = [parentId]
  const seen = new Set(queue)
  while (queue.length > 0) {
    const current = queue.shift()!
    for (const metric of metrics) {
      if (metric.dependsOn !== current || seen.has(metric.id)) continue
      seen.add(metric.id)
      out.push(metric.id)
      queue.push(metric.id)
    }
  }
  return out
}

export function FieldInput({ field, onChange }: FieldInputProps) {
  const labelId = useId()
  const controlId = useId()
  const helpId = useId()

  const { metric, value, depth } = field
  const answered = value !== null && value !== ''
  const describedBy = metric.help ? helpId : undefined
  const asSelect = metric.type === 'choice' && metric.options.length > CHIP_LIMIT
  const asFreeText = metric.type === 'choice' && metric.options.length === 0
  // Buttons cannot be the target of a <label>, so grouped controls get an
  // aria-labelledby group instead.
  const nativeLabel =
    metric.type === 'number' || metric.type === 'text' || asSelect || asFreeText

  const groupProps = {
    role: 'group' as const,
    'aria-labelledby': labelId,
    'aria-describedby': describedBy,
  }
  const answeredAttr = answered ? 'true' : 'false'

  let control: ReactNode = null
  switch (metric.type) {
    case 'bool':
      control = (
        <div className="segmented" data-answered={answeredAttr} {...groupProps}>
          <button
            type="button"
            className="segmented__opt"
            data-tone="no"
            aria-pressed={value === false}
            onClick={() => onChange(value === false ? null : false)}
          >
            Non
          </button>
          <button
            type="button"
            className="segmented__opt"
            data-tone="yes"
            aria-pressed={value === true}
            onClick={() => onChange(value === true ? null : true)}
          >
            Oui
          </button>
        </div>
      )
      break

    case 'scale': {
      // Long or numerous levels wrap onto a second row rather than being
      // truncated to an unreadable stub.
      const wrap = metric.options.length > 3 || metric.options.some((o) => o.length > 9)
      control = (
        <div
          className={wrap ? 'segmented segmented--wrap' : 'segmented'}
          data-answered={answeredAttr}
          {...groupProps}
        >
          {metric.options.map((option) => (
            <button
              key={option}
              type="button"
              className="segmented__opt"
              aria-pressed={value === option}
              onClick={() => onChange(value === option ? null : option)}
            >
              {option}
            </button>
          ))}
        </div>
      )
      break
    }

    case 'choice':
      if (asFreeText) {
        control = (
          <input
            id={controlId}
            className="input"
            type="text"
            value={typeof value === 'string' ? value : ''}
            aria-describedby={describedBy}
            onChange={(e) => onChange(e.target.value === '' ? null : e.target.value)}
          />
        )
      } else if (asSelect) {
        control = (
          <select
            id={controlId}
            className="select"
            value={typeof value === 'string' ? value : ''}
            aria-describedby={describedBy}
            onChange={(e) => onChange(e.target.value === '' ? null : e.target.value)}
          >
            <option value="">— Non renseigné —</option>
            {metric.options.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        )
      } else {
        control = (
          <div className="chips" data-answered={answeredAttr} {...groupProps}>
            {metric.options.map((option) => (
              <button
                key={option}
                type="button"
                className="chip"
                aria-pressed={value === option}
                onClick={() => onChange(value === option ? null : option)}
              >
                {option}
              </button>
            ))}
          </div>
        )
      }
      break

    case 'number':
      control = (
        <NumberControl
          metric={metric}
          value={value}
          controlId={controlId}
          describedBy={describedBy}
          onChange={onChange}
        />
      )
      break

    case 'text':
      control = (
        <textarea
          id={controlId}
          className="textarea"
          rows={2}
          style={{ minHeight: 64 }}
          value={typeof value === 'string' ? value : ''}
          aria-describedby={describedBy}
          onChange={(e) => onChange(e.target.value === '' ? null : e.target.value)}
        />
      )
      break
  }

  return (
    <FieldShell
      metric={metric}
      depth={depth}
      answered={answered}
      labelId={labelId}
      helpId={helpId}
      nativeLabel={nativeLabel}
      controlId={controlId}
      onClear={() => onChange(null)}
    >
      {control}
    </FieldShell>
  )
}

interface FieldShellProps {
  metric: Metric
  depth: number
  answered: boolean
  labelId: string
  helpId: string
  controlId: string
  nativeLabel: boolean
  onClear: () => void
  children: ReactNode
}

function FieldShell({
  metric,
  depth,
  answered,
  labelId,
  helpId,
  controlId,
  nativeLabel,
  onClear,
  children,
}: FieldShellProps) {
  return (
    <div
      className={depth > 0 ? 'field field--child' : 'field'}
      style={depth > 1 ? { marginInlineStart: (depth - 1) * 10 } : undefined}
      data-answered={answered ? 'true' : 'false'}
    >
      <div className="field__head">
        {nativeLabel ? (
          <label className="field__label" id={labelId} htmlFor={controlId}>
            {metric.label}
          </label>
        ) : (
          <span className="field__label" id={labelId}>
            {metric.label}
          </span>
        )}
        {answered && (
          <>
            <span className="field__check" aria-hidden="true">
              <IconCheck size={15} />
            </span>
            <button
              type="button"
              className="field__clear"
              onClick={onClear}
              aria-label={`Effacer la réponse : ${metric.label}`}
            >
              Effacer
            </button>
          </>
        )}
      </div>
      {metric.help && (
        <p className="field__help" id={helpId}>
          {metric.help}
        </p>
      )}
      {children}
    </div>
  )
}

interface NumberControlProps {
  metric: Metric
  value: MetricValue
  controlId: string
  describedBy: string | undefined
  onChange: (value: MetricValue) => void
}

/**
 * The store only ever holds a finite number or `null`, which would eat a
 * half-typed "72." or "72,5". The raw keystrokes are therefore kept locally and
 * shown *as long as they still describe the stored value* — any change coming
 * from elsewhere (a cleared answer, another day) wins over the draft.
 */
function NumberControl({ metric, value, controlId, describedBy, onChange }: NumberControlProps) {
  const [raw, setRaw] = useState('')

  const parsed = raw.trim() === '' ? null : Number(raw.replace(',', '.'))
  const display =
    raw !== '' && parsed === value ? raw : value === null || value === '' ? '' : String(value)

  const commit = (next: string) => {
    setRaw(next)
    if (next.trim() === '') {
      onChange(null)
      return
    }
    const number = Number(next.replace(',', '.'))
    if (Number.isFinite(number)) onChange(number)
  }

  const clamp = () => {
    if (typeof value !== 'number') return
    const { min, max } = metric
    if (min !== undefined && value < min) onChange(min)
    else if (max !== undefined && value > max) onChange(max)
  }

  return (
    <div className="affix">
      <input
        id={controlId}
        className="input numeric"
        type="number"
        inputMode="decimal"
        step="any"
        min={metric.min}
        max={metric.max}
        value={display}
        aria-describedby={describedBy}
        onChange={(e) => commit(e.target.value)}
        onBlur={clamp}
      />
      {metric.unit && <span className="affix__unit">{metric.unit}</span>}
    </div>
  )
}
