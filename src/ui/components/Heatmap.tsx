/**
 * The calendar view: one column per week (Monday-based, like the French week),
 * one cell per day, months across the top and weekdays down the side.
 *
 * The one rule that matters here: a day with no data and a day scored 0 must
 * never look alike. An unrecorded day is drawn as a dashed outline with no
 * fill at all; a recorded day always carries a fill, even at the bottom of the
 * scale. Reading "I was fine that week" off a gap in the data would be worse
 * than showing nothing.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { addDays, formatDayLong, fromISODate, startOfWeek } from '../../core/date'
import { HEAT_LEVELS, heatColor, heatLevel } from '../../core/colors'
import { formatValue } from '../../core/values'
import type { DaySummary } from '../../core/stats'
import type { Entry, ISODate, Note, TrackedEvent, TrackerConfig } from '../../core/types'
import '../dashboard.css'

export interface HeatmapProps {
  /** One entry per day of the period, in chronological order. */
  days: DaySummary[]
  config: TrackerConfig
  entries: Entry[]
  notes: Note[]
  events: TrackedEvent[]
  /** Base colour of the scale — the active tag's colour, or the accent. */
  color: string
  /** Active tag filter, so the day panel shows the same subset as the grid. */
  tag: string | null
}

const SHORT_MONTH = new Intl.DateTimeFormat('fr-FR', { month: 'short' })
/** Row 0 is Monday: `startOfWeek` is Monday-based, so row index === day offset. */
const WEEKDAY_LABELS = ['lun', 'mar', 'mer', 'jeu', 'ven', 'sam', 'dim']
/** Only every other label is shown, exactly like a contributions graph. */
const SHOWN_WEEKDAYS = [0, 2, 4]

/**
 * Cells shrink as the period grows, so 30 and 90 days fit a ~390px screen
 * without scrolling; a full year always scrolls sideways, by design.
 */
function cellSize(weeks: number): number {
  if (weeks <= 7) return 34
  if (weeks <= 16) return 18
  return 13
}

function isRecorded(day: DaySummary): boolean {
  return day.answered > 0 || day.score !== null
}

function describe(day: DaySummary): string {
  const when = formatDayLong(day.date)
  if (!isRecorded(day)) return `${when} — non renseigné`
  const parts: string[] = [
    day.due > 0 ? `${day.answered} sur ${day.due} renseignés` : `${day.answered} renseignés`,
  ]
  if (day.score !== null) parts.push(`score ${Math.round(day.score * 100)} %`)
  return `${when} — ${parts.join(', ')}`
}

export function Heatmap({ days, config, entries, notes, events, color, tag }: HeatmapProps) {
  const [selected, setSelected] = useState<ISODate | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const grid = useMemo(() => {
    const first = days[0]?.date
    const last = days[days.length - 1]?.date
    if (!first || !last) return null

    const byDate = new Map(days.map((d) => [d.date, d]))
    const weeks: { key: ISODate; cells: { date: ISODate; day: DaySummary | undefined }[] }[] = []
    for (let week = startOfWeek(first); week <= last; week = addDays(week, 7)) {
      const cells = Array.from({ length: 7 }, (_, i) => {
        const date = addDays(week, i)
        return { date, day: byDate.get(date) }
      })
      weeks.push({ key: week, cells })
    }

    // Label a column when its week opens a new month, and only when the label
    // has room before the next one — otherwise short months overlap.
    const months: { column: number; text: string }[] = []
    weeks.forEach((week, i) => {
      const previous = weeks[i - 1]
      const month = week.key.slice(0, 7)
      if (previous && previous.key.slice(0, 7) === month) return
      months.push({ column: i, text: SHORT_MONTH.format(fromISODate(week.key)) })
    })
    const spaced = months.filter((m, i) => {
      const next = months[i + 1]
      return next === undefined || next.column - m.column >= 3
    })

    return { weeks, months: spaced }
  }, [days])

  const cell = cellSize(grid?.weeks.length ?? 0)

  // Open on the most recent week: the last few days are what people look at.
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollLeft = el.scrollWidth
  }, [grid])

  const detail = useMemo(() => {
    if (!selected) return null
    const metrics = config.metrics
      .filter((m) => !tag || m.tags.includes(tag))
      .sort((a, b) => a.order - b.order)
    const values = new Map(
      entries.filter((e) => e.date === selected).map((e) => [e.metricId, e.value]),
    )
    const rows = metrics
      .map((metric) => ({ metric, value: values.get(metric.id) }))
      .filter((row) => row.value !== undefined && row.value !== null && row.value !== '')
    const dayNotes = notes.filter(
      (n) => n.date === selected && (!tag || n.tags.includes(tag)),
    )
    const dayEvents = events.filter(
      (e) => e.start <= selected && e.end >= selected && (!tag || e.tags.includes(tag)),
    )
    return { rows, dayNotes, dayEvents }
  }, [selected, config, entries, notes, events, tag])

  if (!grid) return null

  const style = {
    '--hm-cell': `${cell}px`,
    '--hm-gap': '3px',
    '--hm-month-h': '12px',
  } as CSSProperties

  return (
    <div className="heatmap" style={style}>
      <div className="heatmap__body">
        <div className="heatmap__gutter" aria-hidden="true">
          {SHOWN_WEEKDAYS.map((row) => (
            <span
              key={row}
              className="heatmap__gutter-label"
              style={{ gridRow: row + 1 }}
            >
              {cell >= 18 ? WEEKDAY_LABELS[row] : (WEEKDAY_LABELS[row] ?? '').charAt(0).toUpperCase()}
            </span>
          ))}
        </div>

        <div className="heatmap__scroll" ref={scrollRef}>
          <div
            className="heatmap__grid"
            style={{ gridTemplateColumns: `repeat(${grid.weeks.length}, ${cell}px)` }}
          >
            {grid.months.map((month) => (
              <span
                key={`${month.column}-${month.text}`}
                className="heatmap__month"
                style={{ gridColumn: month.column + 1, gridRow: 1 }}
              >
                {month.text}
              </span>
            ))}

            {grid.weeks.map((week, column) =>
              week.cells.map(({ date, day }, row) => {
                const position = { gridColumn: column + 1, gridRow: row + 2 }
                if (!day) {
                  return (
                    <div
                      key={date}
                      className="heatmap__spacer"
                      style={position}
                      aria-hidden="true"
                    />
                  )
                }
                const recorded = isRecorded(day)
                // A recorded day with an unscorable answer (a free-text note,
                // a categorical choice) still gets the faintest fill: it *was*
                // filled in, it simply has no level.
                const level = day.score === null ? 0 : heatLevel(day.score)
                return (
                  <button
                    key={date}
                    type="button"
                    className={recorded ? 'heatmap__cell' : 'heatmap__cell heatmap__cell--empty'}
                    style={{
                      ...position,
                      ...(recorded ? { background: heatColor(color, level) } : null),
                    }}
                    aria-label={describe(day)}
                    aria-pressed={selected === date}
                    onClick={() => setSelected((current) => (current === date ? null : date))}
                  />
                )
              }),
            )}
          </div>
        </div>
      </div>

      <div className="heatmap__legend">
        <span className="heatmap__swatch heatmap__swatch--empty" />
        <span>non renseigné</span>
        <span className="heatmap__legend-sep" />
        <span>—</span>
        {Array.from({ length: HEAT_LEVELS }, (_, level) => (
          <span
            key={level}
            className="heatmap__swatch"
            style={{ background: heatColor(color, level) }}
          />
        ))}
        <span>+</span>
      </div>

      {selected && detail && (
        <div className="heatmap__detail">
          <div className="row row--between">
            <strong className="small">{formatDayLong(selected)}</strong>
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => setSelected(null)}
            >
              Fermer
            </button>
          </div>

          {detail.rows.length === 0 && detail.dayNotes.length === 0 && detail.dayEvents.length === 0 && (
            <p className="small muted" style={{ margin: 0 }}>
              Aucune donnée ce jour-là.
            </p>
          )}

          {detail.rows.length > 0 && (
            <dl className="heatmap__rows" style={{ margin: 0 }}>
              {detail.rows.map(({ metric, value }) => (
                <div className="heatmap__row" key={metric.id}>
                  <dt className="truncate">{metric.label}</dt>
                  <dd>{formatValue(metric, value ?? null)}</dd>
                </div>
              ))}
            </dl>
          )}

          {detail.dayEvents.length > 0 && (
            <div className="stack stack--tight">
              <span className="section-title">Événements</span>
              {detail.dayEvents.map((event) => (
                <span key={event.id} className="small">
                  {event.label}
                  {event.note ? ` — ${event.note}` : ''}
                </span>
              ))}
            </div>
          )}

          {detail.dayNotes.length > 0 && (
            <div className="stack stack--tight">
              <span className="section-title">Notes</span>
              {detail.dayNotes.map((note) => (
                <span key={note.id} className="small">
                  {note.text}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
