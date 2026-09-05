/**
 * Types for `decide.js`, hand-written.
 *
 * The server is plain Node ESM — it has no build step and must not grow one for
 * three routes. But `tests/push.test.ts` imports `decide.js` directly, and the
 * app's `tsconfig.json` has `allowJs: false`, so without this file the test
 * would not typecheck. Twenty lines of declarations is cheaper than a second
 * TypeScript toolchain.
 */

export type SlotName = 'evening' | 'morning'

export interface PushSubscriptionJson {
  endpoint: string
  keys?: { p256dh?: string; auth?: string }
  expirationTime?: number | null
}

/** Everything `state.json` holds. There is exactly one of these, for one user. */
export interface ReminderState {
  subscription?: PushSubscriptionJson
  times?: Partial<Record<SlotName, string>>
  /** IANA name, e.g. `Europe/Paris`. */
  tz?: string
  /** Most recent day known to be filled, `YYYY-MM-DD`. */
  lastFilled?: string
  /** Unfilled days strictly before today. */
  pendingDays?: number
  /** Per-slot date of the last push actually sent — the de-duplication guard. */
  sent?: Partial<Record<SlotName, string>>
  updatedAt?: string
}

export interface Decision {
  slot: SlotName
  /** The user's local date at the moment of the decision. */
  date: string
  payload: { slot: SlotName; title: string; body: string }
}

export declare const SLOTS: readonly SlotName[]

export declare function parseHhMm(value: unknown): number | null

export declare function zonedNow(
  instant: Date,
  timeZone: string,
): { date: string; minute: number }

export declare function addDays(isoDate: string, delta: number): string

export declare function decide(
  state: ReminderState | null | undefined,
  now: Date,
  windowMinutes?: number,
): Decision | null

export declare function markSent(
  state: ReminderState,
  slot: SlotName,
  date: string,
): ReminderState

export declare function isDeadSubscription(statusCode: number | undefined): boolean
