/**
 * The "why bother tracking" screen: period + theme filter, a handful of
 * headline figures, the calendar heatmap, the trends worth charting, one card
 * per indicator, and the medical export.
 *
 * Every number on this screen comes from `core/stats`, so the dashboard and the
 * export can never tell two different stories.
 */
import { useMemo, useState } from 'react'
import { lastNDays } from '../../core/date'
import { compareWindows, computeMetricStats, summarizeDays, summarizeRange } from '../../core/stats'
import { metricColor, tagColor } from '../../core/colors'
import { Heatmap } from '../components/Heatmap'
import { TrendChart } from '../components/TrendChart'
import { MetricStatCard } from '../components/MetricStatCard'
import { TagFilter } from '../components/TagFilter'
import { ExportReport } from '../components/ExportReport'
import { IconDownload, IconRefresh } from '../components/Icons'
import type { Bucket, MetricStats } from '../../core/stats'
import type { Entry, Note, TrackedEvent, TrackerConfig } from '../../core/types'
import type { ScreenProps } from './types'
import '../dashboard.css'

const RANGES = [
  { key: '30', label: '30 j', days: 30 },
  { key: '90', label: '90 j', days: 90 },
  { key: '365', label: '12 mois', days: 365 },
] as const

type RangeKey = (typeof RANGES)[number]['key']

/** Stable empty values, so the memos below do not re-run on every render. */
const EMPTY_CONFIG: TrackerConfig = { metrics: [], tags: [] }
const EMPTY_ENTRIES: Entry[] = []
const EMPTY_NOTES: Note[] = []
const EMPTY_EVENTS: TrackedEvent[] = []

/** One point per day is unreadable past a couple of months. */
function bucketFor(days: number): Bucket {
  if (days <= 45) return 'day'
  if (days <= 200) return 'week'
  return 'month'
}

function bucketNoun(bucket: Bucket): string {
  if (bucket === 'day') return 'par jour'
  if (bucket === 'week') return 'par semaine'
  return 'par mois'
}

function SummaryCell({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="summary__cell">
      <span className="summary__label">{label}</span>
      <span className="summary__value">{value}</span>
      <span className="summary__sub">{sub}</span>
    </div>
  )
}

export function DashboardScreen({ tracker }: ScreenProps) {
  const [rangeKey, setRangeKey] = useState<RangeKey>('90')
  const [tag, setTag] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)

  const snapshot = tracker.snapshot
  const config = snapshot?.config ?? EMPTY_CONFIG
  const entries = snapshot?.entries ?? EMPTY_ENTRIES
  const notes = snapshot?.notes ?? EMPTY_NOTES
  const events = snapshot?.events ?? EMPTY_EVENTS

  const rangeDays = RANGES.find((r) => r.key === rangeKey)?.days ?? 90
  const range = useMemo(() => lastNDays(rangeDays), [rangeDays])
  const bucket = bucketFor(rangeDays)

  // A tag deleted from the config must not keep filtering the view.
  const activeTag = tag !== null && config.tags.some((t) => t.id === tag) ? tag : null
  const color = tagColor(config.tags, activeTag)

  const days = useMemo(
    () => summarizeDays(config, entries, range, activeTag ?? undefined),
    [config, entries, range, activeTag],
  )
  const overall = useMemo(() => summarizeRange(days), [days])

  const scoped = useMemo(
    () =>
      config.metrics
        .filter((m) => m.active && (!activeTag || m.tags.includes(activeTag)))
        .sort((a, b) => a.order - b.order),
    [config.metrics, activeTag],
  )

  const stats = useMemo(
    () => scoped.map((metric) => computeMetricStats(metric, entries, range)),
    [scoped, entries, range],
  )

  /** The metric currently on the longest run — the one the streak card is about. */
  const best = useMemo(() => {
    let winner: MetricStats | null = null
    for (const candidate of stats) {
      if (candidate.answered === 0) continue
      if (
        winner === null ||
        candidate.currentStreak > winner.currentStreak ||
        (candidate.currentStreak === winner.currentStreak && candidate.answered > winner.answered)
      ) {
        winner = candidate
      }
    }
    return winner
  }, [stats])

  const comparison = useMemo(
    () => (best ? compareWindows(best.metric, entries, range.to, rangeDays) : null),
    [best, entries, range.to, rangeDays],
  )

  /** Only what is worth a full chart; everything else keeps its sparkline. */
  const trends = useMemo(
    () =>
      stats
        .filter((s) => s.metric.type !== 'text' && s.answered >= 2)
        .sort((a, b) => b.answered - a.answered)
        .slice(0, 3),
    [stats],
  )

  if (exporting && snapshot) {
    // Rendered on its own so the print stylesheet has nothing else to hide.
    return (
      <ExportReport
        snapshot={snapshot}
        range={range}
        tag={activeTag}
        onClose={() => setExporting(false)}
      />
    )
  }

  if (tracker.status === 'loading' && !snapshot) {
    return (
      <div className="empty">
        <span className="spinner" />
        <span>Chargement des données…</span>
      </div>
    )
  }

  if (tracker.status === 'error' && !snapshot) {
    return (
      <div className="stack">
        <div className="banner banner--error" role="alert">
          {tracker.error ?? 'Impossible de charger les données.'}
        </div>
        <button type="button" className="btn btn--block" onClick={() => void tracker.reload()}>
          <IconRefresh size={18} />
          Réessayer
        </button>
      </div>
    )
  }

  const hasData = entries.length > 0 || notes.length > 0

  return (
    <div className="dash">
      {tracker.status === 'error' && (
        <div className="banner banner--error" role="alert">
          <span className="grow">{tracker.error ?? 'Erreur de synchronisation.'}</span>
          <button type="button" className="btn btn--sm" onClick={() => void tracker.reload()}>
            Réessayer
          </button>
        </div>
      )}

      <div className="dash__controls">
        <div className="segmented" role="group" aria-label="Période affichée">
          {RANGES.map((option) => (
            <button
              key={option.key}
              type="button"
              className="segmented__opt"
              aria-pressed={rangeKey === option.key}
              onClick={() => setRangeKey(option.key)}
            >
              {option.label}
            </button>
          ))}
        </div>
        <TagFilter tags={config.tags} value={activeTag} onChange={setTag} />
      </div>

      {!hasData ? (
        <div className="empty">
          <strong>Rien à afficher pour l'instant</strong>
          <span>
            Renseigne ta première journée dans l'onglet Aujourd'hui : le calendrier, les
            tendances et l'export se rempliront tout seuls.
          </span>
        </div>
      ) : (
        <>
          <section className="stack stack--tight">
            <h2 className="section-title">Résumé</h2>
            <div className="summary">
              <SummaryCell
                label="Jours renseignés"
                value={String(overall.recorded)}
                sub={`sur ${overall.total} jours`}
              />
              <SummaryCell
                label="Complétude"
                value={
                  overall.completion === null ? '—' : `${Math.round(overall.completion * 100)} %`
                }
                sub={`${overall.complete} ${overall.complete > 1 ? 'journées complètes' : 'journée complète'}`}
              />
              <SummaryCell
                label="Série en cours"
                value={best ? `${best.currentStreak} j` : '—'}
                sub={best ? best.metric.label : 'aucun indicateur suivi'}
              />
              <SummaryCell
                label="vs. période préc."
                value={
                  comparison
                    ? `${comparison.delta > 0 ? '+' : ''}${Math.round(comparison.delta * 100)} pts`
                    : '—'
                }
                sub={comparison && best ? best.metric.label : 'données insuffisantes'}
              />
            </div>
          </section>

          <section className="stack stack--tight">
            <h2 className="section-title">Calendrier</h2>
            <div className="card">
              <Heatmap
                days={days}
                config={config}
                entries={entries}
                notes={notes}
                events={events}
                color={color}
                tag={activeTag}
              />
            </div>
          </section>

          {trends.length > 0 && (
            <section className="stack stack--tight">
              <h2 className="section-title">
                Tendances <span className="faint">· {bucketNoun(bucket)}</span>
              </h2>
              {trends.map((stat) => (
                <div className="card stack stack--tight" key={stat.metric.id}>
                  <div className="row">
                    <span className="statcard__title grow truncate">{stat.metric.label}</span>
                    <span className="dots">
                      {stat.metric.tags.map((id) => {
                        const found = config.tags.find((t) => t.id === id)
                        return found ? (
                          <span
                            key={id}
                            className="dot"
                            style={{ background: found.color }}
                            title={found.label}
                          />
                        ) : null
                      })}
                    </span>
                  </div>
                  <TrendChart
                    metric={stat.metric}
                    entries={entries}
                    range={range}
                    bucket={bucket}
                    color={metricColor(stat.metric, config.tags)}
                  />
                </div>
              ))}
            </section>
          )}

          <section className="stack stack--tight">
            <h2 className="section-title">Par indicateur</h2>
            {scoped.length === 0 ? (
              <div className="card small muted">Aucun indicateur pour ce thème.</div>
            ) : (
              scoped.map((metric) => (
                <MetricStatCard
                  key={metric.id}
                  metric={metric}
                  entries={entries}
                  range={range}
                  bucket={bucket}
                  tags={config.tags}
                />
              ))
            )}
          </section>

          <section className="stack stack--tight">
            <h2 className="section-title">Export</h2>
            <div className="card stack stack--tight">
              <p className="small muted" style={{ margin: 0 }}>
                Une synthèse imprimable de la période affichée, limitée au thème sélectionné —
                de quoi arriver chez le médecin avec des dates plutôt que des souvenirs.
              </p>
              <button
                type="button"
                className="btn btn--primary btn--block"
                onClick={() => setExporting(true)}
              >
                <IconDownload size={18} />
                Préparer l'export
              </button>
            </div>
          </section>
        </>
      )}
    </div>
  )
}
