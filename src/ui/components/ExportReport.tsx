/**
 * The medical export: a clean summary of one period, restricted to one theme,
 * meant to be printed and handed over at a consultation.
 *
 * Two dependency-free routes out of the app:
 *  - `window.print()`, with the `@media print` block in dashboard.css stripping
 *    the app chrome and printing black on white (a PDF is one more click away
 *    in every browser's print dialog);
 *  - a hand-built CSV, so the data can be reopened in a spreadsheet.
 *
 * Nothing outside the selected period or the selected tag is ever included.
 */
import { useMemo } from 'react'
import { computeMetricStats, listOccurrences, summarizeDays, summarizeRange } from '../../core/stats'
import { formatValue } from '../../core/values'
import type { Occurrence } from '../../core/stats'
import type { DateRange, Metric, Note, Snapshot } from '../../core/types'
import '../dashboard.css'

export interface ExportReportProps {
  snapshot: Snapshot
  range: DateRange
  /** `null` exports every theme. */
  tag: string | null
  onClose: () => void
}

/**
 * A printed document needs the year, which the in-app short formats leave out
 * on purpose. `Intl` is part of the platform — this adds no dependency.
 */
const FULL_DATE = new Intl.DateTimeFormat('fr-FR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})
const STAMP = new Intl.DateTimeFormat('fr-FR', {
  dateStyle: 'long',
  timeStyle: 'short',
})

function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return FULL_DATE.format(new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1))
}

const TYPE_LABELS: Record<Metric['type'], string> = {
  bool: 'Oui / Non',
  scale: 'Échelle',
  choice: 'Catégorie',
  number: 'Nombre',
  text: 'Texte',
}

/**
 * CSV escaping. The delimiter is `;` because that is what a French-locale Excel
 * expects, but every field containing a delimiter, a comma, a quote or a line
 * break is quoted anyway, with inner quotes doubled — so the file also survives
 * being re-imported by anything stricter.
 */
const SEP = ';'

function csvCell(value: string): string {
  return /[";,\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

function toCsv(rows: string[][]): string {
  return rows.map((row) => row.map(csvCell).join(SEP)).join('\r\n')
}

function download(filename: string, csv: string): void {
  // The BOM is what makes Excel read the file as UTF-8 and stop mangling
  // "Symptômes respiratoires".
  const BOM = '\uFEFF'
  const blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

function detailsText(occurrence: Occurrence): string {
  return occurrence.details
    .map((d) => `${d.metric.label} : ${formatValue(d.metric, d.value)}`)
    .join(' · ')
}

export function ExportReport({ snapshot, range, tag, onClose }: ExportReportProps) {
  const { config, entries, notes } = snapshot
  const tagLabels = useMemo(() => {
    if (!tag) return config.tags.map((t) => t.label)
    const found = config.tags.find((t) => t.id === tag)
    return found ? [found.label] : []
  }, [config.tags, tag])

  const metrics = useMemo(
    () =>
      config.metrics
        .filter((m) => m.active && (!tag || m.tags.includes(tag)))
        .sort((a, b) => a.order - b.order),
    [config.metrics, tag],
  )

  const rows = useMemo(
    () => metrics.map((metric) => computeMetricStats(metric, entries, range)),
    [metrics, entries, range],
  )

  const occurrences = useMemo(
    () => listOccurrences(config, entries, range, { tag: tag ?? undefined }),
    [config, entries, range, tag],
  )

  const periodNotes = useMemo<Note[]>(
    () =>
      notes
        .filter((n) => n.date >= range.from && n.date <= range.to)
        .filter((n) => !tag || n.tags.includes(tag))
        .sort((a, b) => a.date.localeCompare(b.date)),
    [notes, range, tag],
  )

  const overall = useMemo(
    () => summarizeRange(summarizeDays(config, entries, range, tag ?? undefined)),
    [config, entries, range, tag],
  )

  const distributionText = (parts: { label: string; count: number }[]) =>
    parts.length === 0 ? '—' : parts.map((p) => `${p.label} ×${p.count}`).join(', ')

  const onDownload = () => {
    const header = [
      ['Journal de suivi — export'],
      ['Période', `${formatDate(range.from)} au ${formatDate(range.to)}`],
      ['Thèmes', tagLabels.join(', ') || 'Tous'],
      ['Généré le', STAMP.format(new Date())],
      [],
      ['Synthèse par indicateur'],
      ['Indicateur', 'Type', 'Jours renseignés', 'Jours attendus', 'Occurrences', 'Taux', 'Répartition'],
    ]
    const summaryRows = rows.map((stat) => [
      stat.metric.label,
      TYPE_LABELS[stat.metric.type],
      String(stat.answered),
      String(stat.due),
      String(stat.positive),
      stat.rate === null ? '' : `${Math.round(stat.rate * 100)}%`,
      distributionText(stat.distribution),
    ])
    const chronology = [
      [],
      ['Chronologie des événements'],
      ['Date', 'Indicateur', 'Valeur', 'Détails'],
      ...occurrences.map((o) => [
        o.date,
        o.metric.label,
        formatValue(o.metric, o.value),
        detailsText(o),
      ]),
      [],
      ['Notes'],
      ['Date', 'Texte'],
      ...periodNotes.map((n) => [n.date, n.text]),
    ]
    const slug = tag ? `-${tag}` : ''
    download(`suivi-${range.from}_${range.to}${slug}.csv`, toCsv([...header, ...summaryRows, ...chronology]))
  }

  return (
    <section className="export">
      <div className="export__toolbar">
        <button type="button" className="btn btn--ghost" onClick={onClose}>
          Retour
        </button>
        <button type="button" className="btn btn--primary grow" onClick={() => window.print()}>
          Imprimer / PDF
        </button>
        <button type="button" className="btn grow" onClick={onDownload}>
          Télécharger en CSV
        </button>
      </div>

      <header className="card export__section">
        <h2>Journal de suivi — synthèse</h2>
        <div className="export__meta" style={{ marginTop: 6 }}>
          <span>
            Période : du <strong>{formatDate(range.from)}</strong> au{' '}
            <strong>{formatDate(range.to)}</strong>
          </span>
          <span>Thèmes inclus : {tagLabels.join(', ') || 'tous'}</span>
          <span>
            {overall.recorded} {overall.recorded > 1 ? 'jours renseignés' : 'jour renseigné'} sur{' '}
            {overall.total}
            {overall.completion !== null
              ? ` · complétude ${Math.round(overall.completion * 100)} %`
              : ''}
          </span>
          <span>Document généré le {STAMP.format(new Date())}</span>
        </div>
      </header>

      <section className="card export__section">
        <h3>Synthèse par indicateur</h3>
        <div className="export__scroll" style={{ marginTop: 10 }}>
          <table className="export__table">
            <thead>
              <tr>
                <th scope="col">Indicateur</th>
                <th scope="col">Type</th>
                <th scope="col">Renseigné</th>
                <th scope="col">Occurrences</th>
                <th scope="col">Taux</th>
                <th scope="col">Répartition</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((stat) => (
                <tr key={stat.metric.id}>
                  <th scope="row">{stat.metric.label}</th>
                  <td>{TYPE_LABELS[stat.metric.type]}</td>
                  <td className="numeric">
                    {stat.answered}
                    {stat.due > 0 ? ` / ${stat.due}` : ''}
                  </td>
                  <td className="numeric">{stat.positive}</td>
                  <td className="numeric">
                    {stat.rate === null ? '—' : `${Math.round(stat.rate * 100)} %`}
                  </td>
                  <td>{distributionText(stat.distribution.slice(0, 4))}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6}>Aucun indicateur pour ce thème.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card export__section">
        <h3>Chronologie des événements</h3>
        <div className="export__scroll" style={{ marginTop: 10 }}>
          <table className="export__table">
            <caption>
              Chaque ligne correspond à un épisode déclaré, avec son intensité et sa cause
              présumée lorsqu'elles ont été renseignées.
            </caption>
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">Indicateur</th>
                <th scope="col">Valeur</th>
                <th scope="col">Détails</th>
              </tr>
            </thead>
            <tbody>
              {occurrences.map((o) => (
                <tr key={`${o.date}-${o.metric.id}`}>
                  <th scope="row">{formatDate(o.date)}</th>
                  <td>{o.metric.label}</td>
                  <td>{formatValue(o.metric, o.value)}</td>
                  <td>{detailsText(o) || '—'}</td>
                </tr>
              ))}
              {occurrences.length === 0 && (
                <tr>
                  <td colSpan={4}>Aucun événement déclaré sur la période.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card export__section">
        <h3>Notes</h3>
        {periodNotes.length === 0 ? (
          <p className="small muted">Aucune note sur la période.</p>
        ) : (
          <div className="export__notes" style={{ marginTop: 10 }}>
            {periodNotes.map((note) => (
              <div className="export__note" key={note.id}>
                <span className="export__note-date">{formatDate(note.date)}</span>
                <span>{note.text}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </section>
  )
}
