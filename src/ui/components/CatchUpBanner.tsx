import { useMemo, useState } from 'react'
import { catchUpState, describeGaps } from '../../core/catchup'
import { formatDayShort, relativeDayLabel, todayISO } from '../../core/date'
import { IconClose } from './Icons'
import type { Entry, ISODate, TrackerConfig } from '../../core/types'

interface CatchUpBannerProps {
  config: TrackerConfig
  entries: Entry[]
  /** Jump the day screen to a missed day. */
  onPick: (date: ISODate) => void
  today?: ISODate
}

/** Never nag about more than this many days at once. */
const MAX_SHOWN = 5

/**
 * The days still owed an answer, with a tap to go and fill each one.
 *
 * This is the honest version of a reminder for an app with no server: it cannot
 * reach the user when the app is closed, but the moment it *is* open it makes
 * sure nothing is silently lost. It also stays quiet when there is nothing to
 * report, which is the whole difference between a useful prompt and one the user
 * learns to swipe away.
 */
export function CatchUpBanner({ config, entries, onPick, today = todayISO() }: CatchUpBannerProps) {
  const [dismissed, setDismissed] = useState(false)

  const state = useMemo(
    () => catchUpState(config, entries, 14, today),
    [config, entries, today],
  )

  // Today being unfilled is not news at 20:00 — the point of the app is that it
  // is about to be filled. Only the past is worth a banner.
  const past = state.gaps.filter((gap) => gap.date < today)
  if (dismissed || past.length === 0) return null

  const shown = past.slice(-MAX_SHOWN).reverse()
  const hidden = past.length - shown.length

  return (
    <div className="card stack--tight" role="status">
      <div className="row row--between">
        <strong className="small">{describeGaps(state.gaps, today)}</strong>
        <button
          type="button"
          className="btn btn--ghost btn--sm btn--icon"
          onClick={() => setDismissed(true)}
          aria-label="Masquer ce rappel"
        >
          <IconClose size={16} />
        </button>
      </div>
      <div className="row row--wrap">
        {shown.map((gap) => (
          <button
            key={gap.date}
            type="button"
            className="chip"
            onClick={() => onPick(gap.date)}
            title={`${gap.missing} réponse${gap.missing > 1 ? 's' : ''} manquante${gap.missing > 1 ? 's' : ''}`}
          >
            {relativeDayLabel(gap.date, today) === 'hier'
              ? 'hier'
              : formatDayShort(gap.date)}
            <span className="faint tiny">{gap.untouched ? 'vide' : `${gap.missing} rest.`}</span>
          </button>
        ))}
        {hidden > 0 && <span className="faint tiny">et {hidden} autre{hidden > 1 ? 's' : ''}</span>}
      </div>
    </div>
  )
}
