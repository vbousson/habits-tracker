import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { answersFor as answersForDate } from '../core/repository'
import { todayISO } from '../core/date'
import type { Answers } from '../core/form'
import type { HabitRepository } from '../core/repository'
import type { Entry, Goal, ISODate, Metric, MetricValue, Note, Snapshot, TrackedEvent } from '../core/types'

export type TrackerStatus = 'loading' | 'ready' | 'error'

export interface TrackerApi {
  status: TrackerStatus
  error: string | null
  snapshot: Snapshot | null
  repo: HabitRepository
  /** `true` while a write is in flight; drives the "Enregistré" indicator. */
  saving: boolean
  lastSavedAt: number | null
  reload: () => Promise<void>
  answersFor: (date: ISODate) => Answers
  setValue: (date: ISODate, metricId: string, value: MetricValue) => void
  flush: () => Promise<void>
  saveNote: (note: Note) => Promise<void>
  deleteNote: (id: string) => Promise<void>
  saveEvent: (event: TrackedEvent) => Promise<void>
  deleteEvent: (id: string) => Promise<void>
  addMetric: (metric: Metric) => Promise<void>
  /**
   * Upsert a goal. Raising a target is two calls in order — the closed previous
   * goal, then its replacement — which is what `supersede` in `core/goals.ts`
   * returns; see the note there on why the history is preserved rather than
   * rewritten.
   */
  saveGoal: (goal: Goal) => Promise<void>
  deleteGoal: (id: string) => Promise<void>
}

/** Long enough to batch a burst of taps, short enough to feel instant. */
const AUTOSAVE_MS = 700

/**
 * Owns the snapshot and every write to the backend.
 *
 * Answers are applied to local state immediately and persisted on a short
 * debounce: the evening form must never make the user wait on a network call,
 * and a dropped connection should cost at most the last few seconds of input.
 */
export function useTracker(repo: HabitRepository): TrackerApi {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [status, setStatus] = useState<TrackerStatus>('loading')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null)

  /** Days touched since the last flush. */
  const pending = useRef(new Set<ISODate>())
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  /**
   * A synchronous mirror of the snapshot.
   *
   * `flush` runs on a timer and on tab-hide, long after the closure that
   * scheduled it was created, so it cannot rely on the `snapshot` state variable
   * without risking a stale read. The ref is written at every mutation point
   * below — never during render.
   */
  const latest = useRef<Snapshot | null>(null)

  const apply = useCallback((next: Snapshot) => {
    latest.current = next
    setSnapshot(next)
    setStatus('ready')
    setError(null)
  }, [])

  const reload = useCallback(async () => {
    setStatus('loading')
    setError(null)
    try {
      apply(await repo.load())
    } catch (e) {
      setError(messageOf(e))
      setStatus('error')
    }
  }, [repo, apply])

  // Initial load. Guarded, because switching backend rebuilds the repository and
  // an in-flight read from the previous one must not overwrite the new snapshot.
  useEffect(() => {
    let alive = true
    void repo.load().then(
      (loaded) => {
        if (alive) apply(loaded)
      },
      (e: unknown) => {
        if (!alive) return
        setError(messageOf(e))
        setStatus('error')
      },
    )
    return () => {
      alive = false
    }
  }, [repo, apply])

  const flush = useCallback(async () => {
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
    }
    const days = [...pending.current]
    pending.current.clear()
    if (days.length === 0 || !latest.current) return

    setSaving(true)
    try {
      for (const date of days) {
        const entries = latest.current.entries.filter((e) => e.date === date)
        await repo.saveDay(date, entries)
      }
      setLastSavedAt(Date.now())
      setError(null)
    } catch (e) {
      // Put the days back so the next attempt — or an explicit retry — resends them.
      for (const d of days) pending.current.add(d)
      setError(messageOf(e))
    } finally {
      setSaving(false)
    }
  }, [repo])

  const setValue = useCallback(
    (date: ISODate, metricId: string, value: MetricValue) => {
      const prev = latest.current
      if (!prev) return
      const updatedAt = new Date().toISOString()
      const rest = prev.entries.filter((e) => !(e.date === date && e.metricId === metricId))
      const entries: Entry[] =
        value === null || value === ''
          ? rest
          : [...rest, { date, metricId, value, updatedAt }]
      const updated = { ...prev, entries }
      latest.current = updated
      setSnapshot(updated)

      pending.current.add(date)
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => void flush(), AUTOSAVE_MS)
    },
    [flush],
  )

  // Never lose the last taps to a backgrounded tab or a closed PWA.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') void flush()
    }
    document.addEventListener('visibilitychange', onHide)
    return () => {
      document.removeEventListener('visibilitychange', onHide)
      void flush()
    }
  }, [flush])

  const write = useCallback(
    async (mutate: (s: Snapshot) => Snapshot, persist: () => Promise<void>) => {
      const previous = latest.current
      if (!previous) return
      const optimistic = mutate(previous)
      latest.current = optimistic
      setSnapshot(optimistic)
      setSaving(true)
      try {
        await persist()
        setLastSavedAt(Date.now())
        setError(null)
      } catch (e) {
        latest.current = previous
        setSnapshot(previous)
        setError(messageOf(e))
      } finally {
        setSaving(false)
      }
    },
    [],
  )

  const api = useMemo<TrackerApi>(
    () => ({
      status,
      error,
      snapshot,
      repo,
      saving,
      lastSavedAt,
      reload,
      answersFor: (date) => answersForDate(latest.current?.entries ?? [], date),
      setValue,
      flush,
      saveNote: (note) =>
        write(
          (s) => ({ ...s, notes: [...s.notes.filter((n) => n.id !== note.id), note] }),
          () => repo.saveNote(note),
        ),
      deleteNote: (id) =>
        write(
          (s) => ({ ...s, notes: s.notes.filter((n) => n.id !== id) }),
          () => repo.deleteNote(id),
        ),
      saveEvent: (event) =>
        write(
          (s) => ({ ...s, events: [...s.events.filter((v) => v.id !== event.id), event] }),
          () => repo.saveEvent(event),
        ),
      deleteEvent: (id) =>
        write(
          (s) => ({ ...s, events: s.events.filter((v) => v.id !== id) }),
          () => repo.deleteEvent(id),
        ),
      addMetric: (metric) =>
        write(
          (s) => ({
            ...s,
            config: {
              ...s.config,
              metrics: [...s.config.metrics.filter((m) => m.id !== metric.id), metric].sort(
                (a, b) => a.order - b.order,
              ),
            },
          }),
          () => repo.addMetric(metric),
        ),
      saveGoal: (goal) =>
        write(
          (s) => ({
            ...s,
            config: {
              ...s.config,
              goals: [...s.config.goals.filter((g) => g.id !== goal.id), goal].sort(
                (a, b) => a.order - b.order,
              ),
            },
          }),
          () => repo.saveGoal(goal),
        ),
      deleteGoal: (id) =>
        write(
          (s) => ({
            ...s,
            config: { ...s.config, goals: s.config.goals.filter((g) => g.id !== id) },
          }),
          () => repo.deleteGoal(id),
        ),
    }),
    [status, error, snapshot, repo, saving, lastSavedAt, reload, setValue, flush, write],
  )

  return api
}

function messageOf(e: unknown): string {
  if (e instanceof Error) return e.message
  return String(e)
}

export { todayISO }
