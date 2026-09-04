/**
 * Renders any `Metric` from its declared type — the single place in the UI that
 * knows what a `bool`, `scale`, `choice`, `number` or `text` question looks
 * like. Visibility and ordering are decided by `core/form`; this component only
 * draws one question and reports the new value.
 *
 * `null` (not answered) and `false` (answered "Non") are different values in the
 * data model, so they are drawn differently: an untouched control keeps a dashed
 * outline and no pressed option, an answered one is solid and carries a check.
 *
 * Graded answers carry `metric.colors` — a red-to-green mood, a green-to-red
 * symptom scale. Only the *chosen* option is filled with its colour; the others
 * keep a quiet dot, so the control stays a control rather than a rainbow. The
 * colour is never the only signal: the selected option also carries a check
 * glyph, a heavier weight and a ring, all of which survive a greyscale print
 * and a red-green colour deficiency.
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

/* --- Option colours ------------------------------------------------------- */

/**
 * Fallback ramp, worst to best, used when the spreadsheet declares no `colors`
 * for an ordered scale, or fewer than it has options.
 */
const DEFAULT_RAMP = ['#c8503c', '#d99022', '#7fae4a', '#2f9e63']

type Rgb = [number, number, number]

/** `#abc` and `#aabbcc`, the two forms a spreadsheet cell realistically holds. */
function parseHex(color: string): Rgb | null {
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim())
  if (!match) return null
  const hex = match[1]!
  const full = hex.length === 3 ? hex.replace(/./g, (c) => c + c) : hex
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as Rgb
}

/** WCAG 2.1 relative luminance. */
function luminance([r, g, b]: Rgb): number {
  const channel = (v: number) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

function ratio(a: number, b: number): number {
  const [hi, lo] = a > b ? [a, b] : [b, a]
  return (hi + 0.05) / (lo + 0.05)
}

/** WCAG contrast between two colours, or `null` if either cannot be parsed. */
export function contrastOf(a: string, b: string): number | null {
  const [x, y] = [parseHex(a), parseHex(b)]
  if (!x || !y) return null
  return ratio(luminance(x), luminance(y))
}

/**
 * A foreground that reaches WCAG AA on `background`, or `null` when none does.
 *
 * Black and white are the extremes of the scale, so whichever of the two wins
 * is the best any foreground can do. That maximum is never below 4.58:1 — it
 * bottoms out around a luminance of 0.179, where both candidates sit just above
 * the 4.5:1 bar — which is why picking the better of the two is enough and no
 * further nudging is needed. The `null` branch is the guard that keeps the
 * claim checked rather than assumed: an unparseable colour, or one that somehow
 * failed, leaves the option in its neutral tone instead of shipping grey on
 * yellow.
 */
export function readableOn(background: string): string | null {
  const rgb = parseHex(background)
  if (!rgb) return null
  const l = luminance(rgb)
  const onWhite = ratio(l, 1)
  const onBlack = ratio(l, 0)
  if (Math.max(onWhite, onBlack) < 4.5) return null
  return onWhite >= onBlack ? '#ffffff' : '#000000'
}

/** Linear interpolation along `DEFAULT_RAMP`, `t` in 0..1. */
function sampleRamp(t: number): string {
  const last = DEFAULT_RAMP.length - 1
  const position = Math.min(last, Math.max(0, t * last))
  const index = Math.floor(position)
  const from = parseHex(DEFAULT_RAMP[index]!)!
  const to = parseHex(DEFAULT_RAMP[Math.min(last, index + 1)]!)!
  const f = position - index
  return `#${from
    .map((v, i) => Math.round(v + (to[i]! - v) * f)
      .toString(16)
      .padStart(2, '0'))
    .join('')}`
}

/**
 * One colour per option, or `null` for the neutral look.
 *
 * `bool` stays neutral: its "Non" / "Oui" tones already read correctly and are
 * not a grade. A `choice` with nothing configured stays neutral too — its
 * labels are unordered, so there is no low-to-high ramp to invent. Everything
 * else is filled in from `DEFAULT_RAMP`, so a half-filled `colors` column
 * degrades instead of failing.
 */
export function optionColors(metric: Metric): string[] | null {
  if (metric.type !== 'scale' && metric.type !== 'choice') return null
  const count = metric.options.length
  if (count === 0) return null
  if (metric.colors.length === 0 && metric.type !== 'scale') return null
  return metric.options.map(
    (_, i) => metric.colors[i] ?? sampleRamp(count < 2 ? 1 : i / (count - 1)),
  )
}

/** The colour fill and its verified foreground, or `null` to stay neutral. */
function toneOf(colors: string[] | null, index: number): { bg: string; fg: string } | null {
  const bg = colors?.[index]
  if (bg === undefined) return null
  const fg = readableOn(bg)
  return fg === null ? null : { bg, fg }
}

/** Dot when quiet, check when chosen — the shape cue that outlives the colour. */
function OptionMark({ color, selected }: { color: string | undefined; selected: boolean }) {
  if (color === undefined) return null
  return (
    <span className="opt-mark" aria-hidden="true">
      {selected ? <IconCheck size={12} /> : <span className="opt-dot" style={{ background: color }} />}
    </span>
  )
}

export function FieldInput({ field, onChange }: FieldInputProps) {
  const labelId = useId()
  const controlId = useId()
  const helpId = useId()

  const { metric, value, depth } = field
  const answered = value !== null && value !== ''
  const describedBy = metric.help ? helpId : undefined
  const ramp = optionColors(metric)
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
          {metric.options.map((option, i) => {
            const selected = value === option
            const tone = toneOf(ramp, i)
            return (
              <button
                key={option}
                type="button"
                className={tone ? 'segmented__opt segmented__opt--tinted' : 'segmented__opt'}
                aria-pressed={selected}
                style={selected && tone ? { background: tone.bg, color: tone.fg } : undefined}
                onClick={() => onChange(selected ? null : option)}
              >
                <OptionMark color={tone?.bg} selected={selected} />
                {option}
              </button>
            )
          })}
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
            {metric.options.map((option, i) => {
              const selected = value === option
              const tone = toneOf(ramp, i)
              return (
                <button
                  key={option}
                  type="button"
                  className={tone ? 'chip chip--tinted' : 'chip'}
                  aria-pressed={selected}
                  style={selected && tone ? { background: tone.bg, color: tone.fg } : undefined}
                  onClick={() => onChange(selected ? null : option)}
                >
                  <OptionMark color={tone?.bg} selected={selected} />
                  {option}
                </button>
              )
            })}
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
