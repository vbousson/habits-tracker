/**
 * Colour helpers shared by the dashboard visualisations.
 *
 * Everything here returns a CSS colour *string* expressed on top of the design
 * tokens, so charts follow the light/dark theme without any JavaScript ever
 * reading a computed style. The only colours quoted literally are the ones that
 * come from the user's own config (a tag colour, a metric override).
 */
import type { Metric, Tag } from './types'

/** Fallback colour: the app accent, as a token so both themes stay correct. */
export const ACCENT = 'var(--accent)'

/** Number of discrete steps in the heatmap scale (level 0 = the faintest fill). */
export const HEAT_LEVELS = 5

/**
 * How much of the base colour each level carries, blended over `--surface-2`.
 * Blending over a surface token rather than over `transparent` keeps the faint
 * levels readable on the dark theme, where a low-alpha tint would vanish.
 */
const HEAT_MIX = [16, 34, 55, 78, 100]

/** `color-mix` wrapper — the one place the CSS function is spelled out. */
export function mix(base: string, percent: number, over = 'transparent'): string {
  const p = Math.min(100, Math.max(0, Math.round(percent)))
  return `color-mix(in srgb, ${base} ${p}%, ${over})`
}

/**
 * Map a 0..1 score onto a discrete level.
 * A score of exactly 0 is a real answer ("recorded, as bad as it gets") and
 * therefore still gets level 0, which is *filled*. "Not recorded" is not a
 * score at all and never reaches this function.
 */
export function heatLevel(score: number, levels = HEAT_LEVELS): number {
  const clamped = Math.min(1, Math.max(0, score))
  return Math.min(levels - 1, Math.floor(clamped * levels))
}

export function heatColor(base: string, level: number): string {
  const index = Math.min(HEAT_MIX.length - 1, Math.max(0, level))
  return mix(base, HEAT_MIX[index] ?? 100, 'var(--surface-2)')
}

/** A metric's own colour, its first tag's colour, or the accent. */
export function metricColor(metric: Metric, tags: Tag[]): string {
  if (metric.color) return metric.color
  const first = metric.tags[0]
  const tag = first ? tags.find((t) => t.id === first) : undefined
  return tag?.color ?? ACCENT
}

/** The colour the whole dashboard is tinted with for the active tag filter. */
export function tagColor(tags: Tag[], id: string | null | undefined): string {
  if (!id) return ACCENT
  return tags.find((t) => t.id === id)?.color ?? ACCENT
}
