/**
 * A bottom-sheet modal.
 *
 * Mounting the component opens it; unmounting closes it. Callers therefore
 * render it conditionally, which keeps their own state (a draft answer, a note
 * being edited) naturally scoped to one opening.
 */
import { useEffect, useId, useRef } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { IconClose } from './Icons'

export interface SheetProps {
  title: string
  onClose: () => void
  children: ReactNode
  /** Sticky action bar, kept in thumb reach at the bottom of the panel. */
  footer?: ReactNode
}

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'

export function Sheet({ title, onClose, children, footer }: SheetProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  const titleId = useId()

  useEffect(() => {
    closeRef.current = onClose
  }, [onClose])

  useEffect(() => {
    const panel = panelRef.current
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const body = document.body
    const previousOverflow = body.style.overflow
    // The page behind a sheet must not scroll under the user's thumb.
    body.style.overflow = 'hidden'
    ;(panel?.querySelector<HTMLElement>(FOCUSABLE) ?? panel)?.focus()

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        closeRef.current()
        return
      }
      if (event.key !== 'Tab' || !panel) return
      const items = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)]
      const first = items[0]
      const last = items[items.length - 1]
      if (!first || !last) {
        event.preventDefault()
        panel.focus()
        return
      }
      const active = document.activeElement
      if (event.shiftKey && (active === first || active === panel)) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && active === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      body.style.overflow = previousOverflow
      opener?.focus()
    }
  }, [])

  return createPortal(
    <div className="sheet">
      <div className="sheet__backdrop" onClick={() => closeRef.current()} />
      <div
        className="sheet__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        ref={panelRef}
        tabIndex={-1}
      >
        <header className="sheet__head">
          <h2 id={titleId} className="grow truncate">
            {title}
          </h2>
          <button type="button" className="btn btn--ghost btn--icon" onClick={onClose} aria-label="Fermer">
            <IconClose size={20} />
          </button>
        </header>
        <div className="sheet__body">{children}</div>
        {footer ? <footer className="sheet__foot">{footer}</footer> : null}
      </div>
    </div>,
    document.body,
  )
}
