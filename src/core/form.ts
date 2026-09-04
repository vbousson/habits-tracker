/**
 * The form engine.
 *
 * Turns the configuration into the list of questions worth asking *today*.
 * Two rules keep the evening routine under five minutes:
 *
 *  1. **Schedule** — a metric is only proposed on the weekdays it applies to,
 *     so commuting questions stay out of the way at the weekend.
 *  2. **Dependency** — a metric declaring `dependsOn` is hidden until its parent
 *     is answered positively. This is what makes "urticaire → intensité → cause"
 *     work without a bespoke composite field type, and it is why rare events can
 *     live outside the daily flow while still capturing rich detail when they fire.
 */
import { isDueOn } from './schedule'
import { isTruthy } from './values'
import type { ISODate, Metric, MetricValue, TrackerConfig } from './types'

export interface FormField {
  metric: Metric
  value: MetricValue
  /** Fields revealed by a parent answer are indented and animated in. */
  depth: number
}

export interface FormSection {
  group: string
  fields: FormField[]
}

export type Answers = Map<string, MetricValue>

function byId(config: TrackerConfig): Map<string, Metric> {
  return new Map(config.metrics.map((m) => [m.id, m]))
}

/** How many parents deep a metric sits; guards against a config cycle. */
function depthOf(metric: Metric, index: Map<string, Metric>): number {
  let depth = 0
  let current = metric
  const seen = new Set<string>([metric.id])
  while (current.dependsOn) {
    const parent = index.get(current.dependsOn)
    if (!parent || seen.has(parent.id)) break
    seen.add(parent.id)
    current = parent
    depth += 1
  }
  return depth
}

/**
 * Visibility of a follow-up hangs on the parent's *answer*, never on the
 * parent's own visibility.
 *
 * That distinction matters: the parent of a follow-up is typically a rare event
 * declared through the quick-add button and deliberately absent from the daily
 * flow. Gating the child on the parent being displayed would make it impossible
 * to ever ask for the intensity of a flare-up. Reading the answer instead also
 * removes the recursion, so a mistyped `depends_on` cycle in the spreadsheet
 * cannot blow the stack.
 */
function isVisible(
  metric: Metric,
  date: ISODate,
  answers: Answers,
  index: Map<string, Metric>,
): boolean {
  if (!metric.active) return false

  if (metric.dependsOn) {
    const parent = index.get(metric.dependsOn)
    if (!parent || !parent.active) return false
    return isTruthy(parent, answers.get(parent.id) ?? null)
  }

  if (metric.mode === 'quick') {
    // Never *asked*, but once recorded for the day it belongs in the form so it
    // can be reviewed or corrected — and so its follow-ups are not left orphaned
    // under a section with nothing to explain them.
    //
    // The test is "has an answer", not "has a positive answer": correcting a
    // flare-up to "Non" must leave the question on screen so the correction is
    // visible, rather than making the row vanish under the user's finger. It
    // disappears only once the answer is cleared entirely.
    const answer = answers.get(metric.id) ?? null
    return answer !== null && answer !== ''
  }

  return isDueOn(metric.schedule, date)
}

/** The questions to ask for `date`, grouped by section, in configured order. */
export function buildDailyForm(
  config: TrackerConfig,
  date: ISODate,
  answers: Answers,
): FormSection[] {
  const index = byId(config)
  const sections: FormSection[] = []
  const positions = new Map<string, number>()

  for (const metric of config.metrics) {
    if (!isVisible(metric, date, answers, index)) continue
    let position = positions.get(metric.group)
    if (position === undefined) {
      position = sections.length
      positions.set(metric.group, position)
      sections.push({ group: metric.group, fields: [] })
    }
    sections[position]!.fields.push({
      metric,
      value: answers.get(metric.id) ?? null,
      depth: depthOf(metric, index),
    })
  }
  return sections
}

/**
 * Metrics reachable from the always-available quick-add button: the rare events
 * that should never pollute the daily flow but must be one tap away.
 */
export function quickAddMetrics(config: TrackerConfig): Metric[] {
  return config.metrics.filter((m) => m.active && (m.mode === 'quick' || m.mode === 'both') && !m.dependsOn)
}

/** The root metric plus whatever its answer has revealed, for the quick-add sheet. */
export function buildQuickForm(
  config: TrackerConfig,
  answers: Answers,
  rootId: string,
): FormField[] {
  const index = byId(config)
  const root = index.get(rootId)
  if (!root) return []

  const fields: FormField[] = [{ metric: root, value: answers.get(root.id) ?? null, depth: 0 }]
  const queue = [root.id]
  const seen = new Set(queue)
  while (queue.length) {
    const parentId = queue.shift()!
    const parent = index.get(parentId)!
    if (!isTruthy(parent, answers.get(parentId) ?? null)) continue
    for (const child of config.metrics) {
      if (child.dependsOn !== parentId || !child.active || seen.has(child.id)) continue
      seen.add(child.id)
      queue.push(child.id)
      fields.push({ metric: child, value: answers.get(child.id) ?? null, depth: depthOf(child, index) })
    }
  }
  return fields
}

export interface FormProgress {
  answered: number
  total: number
  ratio: number
}

export function formProgress(sections: FormSection[]): FormProgress {
  let answered = 0
  let total = 0
  for (const section of sections) {
    for (const field of section.fields) {
      total += 1
      if (field.value !== null && field.value !== '') answered += 1
    }
  }
  return { answered, total, ratio: total === 0 ? 1 : answered / total }
}
