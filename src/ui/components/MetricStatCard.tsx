/**
 * One card per metric: the headline figure, the streaks, a sparkline and the
 * change against the previous period.
 *
 * On the delta colour — deliberately neutral. The config has no notion of
 * polarity: "vélo" going up is good, "crise d'urticaire" or "grignotage
 * nocturne" going up is not, and nothing in the data says which is which.
 * Guessing from the label would be a heuristic that quietly gets it wrong on
 * someone's most important metric, so the figure is always shown in the accent
 * colour with an explicit direction arrow, and the reading is left to the
 * person who defined the metric.
 */
import { useMemo } from 'react'
import { compareWindows, computeMetricStats } from '../../core/stats'
import { daysBetween } from '../../core/date'
import { metricColor } from '../../core/colors'
import { TrendChart, levelLabel } from './TrendChart'
import { optionColors } from './FieldInput'
import type { Bucket } from '../../core/stats'
import type { DateRange, Entry, Metric, Tag } from '../../core/types'
import '../dashboard.css'

export interface MetricStatCardProps {
  metric: Metric
  entries: Entry[]
  range: DateRange
  bucket: Bucket
  tags: Tag[]
}

function pct(value: number): string {
  return `${Math.round(value * 100)} %`
}

function plural(n: number, one: string, many: string): string {
  return n > 1 ? many : one
}

export function MetricStatCard({ metric, entries, range, bucket, tags }: MetricStatCardProps) {
  const stats = useMemo(
    () => computeMetricStats(metric, entries, range),
    [metric, entries, range],
  )

  const windowDays = daysBetween(range.from, range.to) + 1
  const comparison = useMemo(
    () => compareWindows(metric, entries, range.to, windowDays),
    [metric, entries, range.to, windowDays],
  )

  const color = metricColor(metric, tags)
  // The same per-option ramp the answer buttons use, so a distribution reads
  // with the colours the question was answered in. Falls back to the metric's
  // own colour for a label that is no longer in `options`.
  const ramp = optionColors(metric)
  const dots = metric.tags
    .map((id) => tags.find((t) => t.id === id))
    .filter((t): t is Tag => t !== undefined)

  const headline = (() => {
    switch (metric.type) {
      case 'bool':
        return stats.rate === null ? '—' : pct(stats.rate)
      case 'scale':
      case 'number':
        return stats.average === null ? '—' : levelLabel(metric, stats.average)
      case 'choice':
        return stats.distribution[0]?.label ?? '—'
      case 'text':
        return String(stats.answered)
    }
  })()

  const sub = (() => {
    if (stats.answered === 0) return 'jamais renseigné sur la période'
    switch (metric.type) {
      case 'bool':
        return `${stats.positive} ${plural(stats.positive, 'jour', 'jours')} sur ${stats.answered} ${plural(stats.answered, 'renseigné', 'renseignés')}`
      case 'scale':
      case 'number':
        return `moyenne sur ${stats.answered} ${plural(stats.answered, 'relevé', 'relevés')}`
      case 'choice':
        return `réponse la plus fréquente · ${stats.answered} ${plural(stats.answered, 'relevé', 'relevés')}`
      case 'text':
        return `${plural(stats.answered, 'saisie', 'saisies')} sur la période`
    }
  })()

  const total = stats.distribution.reduce((sum, d) => sum + d.count, 0)

  return (
    <article className="card statcard">
      <header className="statcard__head">
        <span className="statcard__title grow truncate">{metric.label}</span>
        <span className="dots">
          {dots.map((tag) => (
            <span key={tag.id} className="dot" style={{ background: tag.color }} title={tag.label} />
          ))}
        </span>
      </header>

      <div className="statcard__figure">
        <div style={{ minWidth: 0 }}>
          <div className="statcard__value">{headline}</div>
          <div className="small muted truncate">{sub}</div>
        </div>
        {comparison && (
          <span
            className="statcard__delta"
            title="Variation du taux de réponses positives par rapport à la période précédente"
          >
            <span aria-hidden="true">
              {comparison.delta > 0 ? '↑' : comparison.delta < 0 ? '↓' : '='}
            </span>
            {`${comparison.delta > 0 ? '+' : ''}${Math.round(comparison.delta * 100)} pts`}
          </span>
        )}
      </div>

      {comparison && (
        <div className="tiny faint">vs. période précédente</div>
      )}

      {stats.answered > 0 && (
        <div className="statcard__meta">
          <span>
            Série en cours : <strong>{stats.currentStreak} j</strong>
          </span>
          <span>
            Record : <strong>{stats.bestStreak} j</strong>
          </span>
          <span>
            Renseigné : <strong>{stats.answered}</strong>
            {stats.due > 0 ? ` / ${stats.due}` : ''}
          </span>
        </div>
      )}

      {metric.type === 'choice' && stats.distribution.length > 0 && (
        <div className="dist">
          {stats.distribution.slice(0, 4).map((slice) => (
            <div className="dist__row" key={slice.label}>
              <span className="truncate">{slice.label}</span>
              <span className="dist__track">
                <span
                  className="dist__bar"
                  style={{
                    background: ramp?.[metric.options.indexOf(slice.label)] ?? color,
                    width: total === 0 ? '0%' : `${(slice.count / total) * 100}%`,
                  }}
                />
              </span>
              <span className="dist__count">{slice.count}</span>
            </div>
          ))}
        </div>
      )}

      {metric.type !== 'text' && stats.answered > 0 && (
        <TrendChart
          metric={metric}
          entries={entries}
          range={range}
          bucket={bucket}
          color={color}
          variant="spark"
        />
      )}
    </article>
  )
}
