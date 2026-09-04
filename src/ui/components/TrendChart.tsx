/**
 * A compact, dependency-free SVG chart for one metric over one period.
 *
 * Two readings, picked from the metric type:
 *  - `bool` / `choice` → bars counting the positive answers per bucket, which is
 *    how "how many flare-ups this week" is actually read;
 *  - `scale` / `number` → a line + area of the mean value, labelled on the y
 *    axis with the *real* levels (Faible / Moyen / Fort), never 0..1.
 *
 * Buckets holding no data are drawn as gaps, never interpolated: joining two
 * points across an unrecorded fortnight would invent readings that were never
 * taken, which is exactly the kind of chart a doctor should not be handed.
 */
import { useId, useMemo, useState } from 'react'
import { bucketSeries } from '../../core/stats'
import { formatDayShort, fromISODate } from '../../core/date'
import { ACCENT } from '../../core/colors'
import type { Bucket, BucketPoint } from '../../core/stats'
import type { DateRange, Entry, ISODate, Metric } from '../../core/types'
import '../dashboard.css'

export interface TrendChartProps {
  metric: Metric
  entries: Entry[]
  range: DateRange
  bucket: Bucket
  /** Series colour; defaults to the app accent. */
  color?: string
  /** `spark` is the stripped-down variant embedded in a metric card. */
  variant?: 'full' | 'spark'
}

const SHORT_MONTH = new Intl.DateTimeFormat('fr-FR', { month: 'short' })

/** Bars for things you count, a line for things you measure. */
function chartMode(metric: Metric): 'bars' | 'line' {
  return metric.type === 'scale' || metric.type === 'number' ? 'line' : 'bars'
}

export function bucketLabel(key: ISODate, bucket: Bucket): string {
  if (bucket === 'month') {
    const d = fromISODate(key)
    return `${SHORT_MONTH.format(d)} ${d.getFullYear()}`
  }
  if (bucket === 'week') return `sem. du ${formatDayShort(key)}`
  return formatDayShort(key)
}

function tickLabel(key: ISODate, bucket: Bucket): string {
  if (bucket === 'month') return SHORT_MONTH.format(fromISODate(key))
  return formatDayShort(key)
}

/** Turn a 0..1 mean back into something a human recognises. */
export function levelLabel(metric: Metric, value: number): string {
  if (metric.type === 'scale') {
    const last = metric.options.length - 1
    if (last < 0) return `${Math.round(value * 100)} %`
    const index = Math.min(last, Math.max(0, Math.round(value * last)))
    return metric.options[index] ?? '—'
  }
  if (metric.type === 'number') {
    const min = metric.min ?? 0
    const max = metric.max ?? 0
    const raw = max > min ? min + value * (max - min) : value
    const rounded = Math.round(raw * 10) / 10
    return metric.unit ? `${rounded} ${metric.unit}` : String(rounded)
  }
  return `${Math.round(value * 100)} %`
}

function plural(n: number, one: string, many: string): string {
  return n > 1 ? many : one
}

function describePoint(metric: Metric, point: BucketPoint, bucket: Bucket): string {
  const when = bucketLabel(point.key, bucket)
  if (point.answered === 0) return `${when} — aucune donnée`
  if (chartMode(metric) === 'bars') {
    return `${when} — ${point.positive} fois sur ${point.answered} ${plural(point.answered, 'relevé', 'relevés')}`
  }
  if (point.value === null) return `${when} — ${point.answered} ${plural(point.answered, 'relevé', 'relevés')}`
  return `${when} — ${levelLabel(metric, point.value)} en moyenne`
}

export function TrendChart({
  metric,
  entries,
  range,
  bucket,
  color = ACCENT,
  variant = 'full',
}: TrendChartProps) {
  const titleId = useId()
  const [active, setActive] = useState<number | null>(null)

  const points = useMemo(
    () => bucketSeries(metric, entries, range, bucket),
    [metric, entries, range, bucket],
  )

  const mode = chartMode(metric)
  const spark = variant === 'spark'

  const yLabels = useMemo<{ value: number; text: string }[]>(() => {
    if (spark || mode !== 'line') return []
    if (metric.type === 'scale' && metric.options.length >= 2 && metric.options.length <= 5) {
      const last = metric.options.length - 1
      return metric.options.map((text, i) => ({ value: i / last, text }))
    }
    return [
      { value: 0, text: levelLabel(metric, 0) },
      { value: 1, text: levelLabel(metric, 1) },
    ]
  }, [spark, mode, metric])

  const maxCount = Math.max(1, ...points.map((p) => p.positive))

  // Geometry. The viewBox is a fixed coordinate space scaled uniformly to the
  // available width, so nothing is ever stretched out of shape.
  const width = 320
  const height = spark ? 42 : 132
  const padLeft = spark ? 1 : yLabels.length > 0 ? 46 : 24
  const padRight = spark ? 1 : 6
  const padTop = spark ? 4 : 10
  const padBottom = spark ? 4 : 20
  const plotW = width - padLeft - padRight
  const plotH = height - padTop - padBottom
  const baseline = padTop + plotH
  const band = points.length > 0 ? plotW / points.length : plotW

  const x = (i: number) => padLeft + band * (i + 0.5)
  const yFromUnit = (v: number) => padTop + (1 - Math.min(1, Math.max(0, v))) * plotH

  // Line mode: one polyline per uninterrupted run of recorded buckets.
  const segments: { x: number; y: number }[][] = []
  {
    let run: { x: number; y: number }[] = []
    points.forEach((p, i) => {
      if (p.value === null) {
        if (run.length > 0) segments.push(run)
        run = []
        return
      }
      run.push({ x: x(i), y: yFromUnit(p.value) })
    })
    if (run.length > 0) segments.push(run)
  }

  const ticks = useMemo(() => {
    const n = points.length
    if (n === 0) return []
    if (n <= 2) return [...points.keys()]
    return [...new Set([0, Math.round((n - 1) / 2), n - 1])]
  }, [points])

  const summary = useMemo(() => {
    const recorded = points.filter((p) => p.answered > 0).length
    if (recorded === 0) return `${metric.label} — aucune donnée sur la période.`
    if (mode === 'bars') {
      const total = points.reduce((sum, p) => sum + p.positive, 0)
      return `${metric.label} — ${total} ${plural(total, 'occurrence', 'occurrences')} sur ${recorded} ${plural(recorded, 'période', 'périodes')} renseignées.`
    }
    const valued = points.filter((p): p is BucketPoint & { value: number } => p.value !== null)
    if (valued.length === 0) return `${metric.label} — aucune valeur exploitable.`
    const mean = valued.reduce((sum, p) => sum + p.value, 0) / valued.length
    return `${metric.label} — ${levelLabel(metric, mean)} en moyenne sur ${valued.length} ${plural(valued.length, 'période', 'périodes')}.`
  }, [points, metric, mode])

  const activePoint = active === null ? undefined : points[active]

  return (
    <div className={spark ? 'trend trend--spark' : 'trend'}>
      {!spark && (
        <div className="trend__readout" aria-live="polite">
          {activePoint ? describePoint(metric, activePoint, bucket) : summary}
        </div>
      )}
      <svg
        className="trend__svg"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-labelledby={titleId}
        onPointerLeave={() => setActive(null)}
      >
        <title id={titleId}>{summary}</title>

        {/* Baseline */}
        <line
          x1={padLeft}
          y1={baseline}
          x2={width - padRight}
          y2={baseline}
          stroke="var(--border)"
          strokeWidth={1}
        />

        {/* Y axis: real level labels, plus a faint guide per label. */}
        {yLabels.map((label) => (
          <g key={label.text + label.value}>
            <line
              x1={padLeft}
              y1={yFromUnit(label.value)}
              x2={width - padRight}
              y2={yFromUnit(label.value)}
              stroke="var(--border)"
              strokeWidth={0.6}
              strokeDasharray="2 3"
            />
            <text
              x={padLeft - 6}
              y={yFromUnit(label.value) + 3}
              textAnchor="end"
              fontSize={8.5}
              fill="var(--text-faint)"
            >
              {label.text}
            </text>
          </g>
        ))}

        {mode === 'bars' && !spark && (
          <text x={padLeft - 6} y={padTop + 4} textAnchor="end" fontSize={8.5} fill="var(--text-faint)">
            {maxCount}
          </text>
        )}

        {/* Missing buckets: a faint tick on the baseline, so "no data" is
            visible without pretending to be a zero. */}
        {points.map((p, i) =>
          p.answered === 0 ? (
            <line
              key={`gap-${p.key}`}
              x1={x(i)}
              y1={baseline}
              x2={x(i)}
              y2={baseline + 3}
              stroke="var(--text-faint)"
              strokeWidth={1}
              opacity={0.45}
            />
          ) : null,
        )}

        {mode === 'bars' &&
          points.map((p, i) => {
            if (p.answered === 0) return null
            const w = Math.max(1.5, band * 0.62)
            const cx = x(i) - w / 2
            if (p.positive === 0) {
              // Recorded, but nothing happened: a flat stub, clearly not a gap.
              return (
                <rect
                  key={`bar-${p.key}`}
                  x={cx}
                  y={baseline - 2}
                  width={w}
                  height={2}
                  rx={1}
                  fill={color}
                  opacity={0.35}
                />
              )
            }
            const h = Math.max(2, (p.positive / maxCount) * plotH)
            return (
              <rect
                key={`bar-${p.key}`}
                x={cx}
                y={baseline - h}
                width={w}
                height={h}
                rx={Math.min(2, w / 2)}
                fill={color}
                opacity={active === null || active === i ? 1 : 0.45}
              />
            )
          })}

        {mode === 'line' &&
          segments.map((seg, si) => {
            const first = seg[0]
            const last = seg[seg.length - 1]
            if (!first || !last) return null
            const line = seg.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
            const area = `M${first.x.toFixed(1)},${baseline} ${seg
              .map((p) => `L${p.x.toFixed(1)},${p.y.toFixed(1)}`)
              .join(' ')} L${last.x.toFixed(1)},${baseline} Z`
            return (
              <g key={`seg-${si}`}>
                <path d={area} fill={color} opacity={0.14} />
                <path
                  d={line}
                  fill="none"
                  stroke={color}
                  strokeWidth={spark ? 1.6 : 2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </g>
            )
          })}

        {mode === 'line' &&
          points.map((p, i) =>
            p.value === null ? null : (
              <circle
                key={`dot-${p.key}`}
                cx={x(i)}
                cy={yFromUnit(p.value)}
                r={active === i ? 3.4 : spark ? 1.4 : 2.1}
                fill={color}
              />
            ),
          )}

        {/* X ticks */}
        {!spark &&
          ticks.map((i) => {
            const p = points[i]
            if (!p) return null
            return (
              <text
                key={`tick-${p.key}`}
                x={Math.min(width - padRight, Math.max(padLeft, x(i)))}
                y={height - 6}
                textAnchor={i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'}
                fontSize={8.5}
                fill="var(--text-faint)"
              >
                {tickLabel(p.key, bucket)}
              </text>
            )
          })}

        {/* Hover / tap targets, one per bucket. */}
        {!spark &&
          points.map((p, i) => (
            <rect
              key={`hit-${p.key}`}
              className="trend__hit"
              x={padLeft + band * i}
              y={padTop}
              width={band}
              height={plotH}
              onPointerEnter={() => setActive(i)}
              onPointerDown={() => setActive(i)}
            >
              <title>{describePoint(metric, p, bucket)}</title>
            </rect>
          ))}
      </svg>
    </div>
  )
}
