/** Inline, currentColor-driven icons — no icon package, no font, no network. */
interface IconProps {
  size?: number
  className?: string
}

function svg(path: React.ReactNode, extra?: Partial<React.SVGProps<SVGSVGElement>>) {
  return function Icon({ size = 22, className }: IconProps) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.9}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
        className={className}
        {...extra}
      >
        {path}
      </svg>
    )
  }
}

export const IconToday = svg(
  <>
    <rect x="3" y="4.5" width="18" height="16" rx="3" />
    <path d="M8 2.5v4M16 2.5v4M3 9.5h18" />
    <path d="m9 14.5 2 2 4-4" />
  </>,
)

export const IconChart = svg(
  <>
    <path d="M3 3v16.5a1.5 1.5 0 0 0 1.5 1.5H21" />
    <path d="m7 15 3.5-4 3 2.5L18 8" />
  </>,
)

export const IconJournal = svg(
  <>
    <path d="M5 3.5h11a3 3 0 0 1 3 3v14H8a3 3 0 0 1-3-3z" />
    <path d="M5 17.5h14" />
    <path d="M9 8h6M9 11.5h4" />
  </>,
)

export const IconSettings = svg(
  <>
    <circle cx="12" cy="12" r="3.2" />
    <path d="M19.4 14.5a1.6 1.6 0 0 0 .32 1.77l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.6 1.6 0 0 0-1.77-.32 1.6 1.6 0 0 0-1 1.47V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1.05-1.47 1.6 1.6 0 0 0-1.77.32l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.6 1.6 0 0 0 .32-1.77 1.6 1.6 0 0 0-1.47-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.47-1.05 1.6 1.6 0 0 0-.32-1.77l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.6 1.6 0 0 0 1.77.32H9a1.6 1.6 0 0 0 1-1.47V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.47 1.6 1.6 0 0 0 1.77-.32l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.6 1.6 0 0 0-.32 1.77V9a1.6 1.6 0 0 0 1.47 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z" />
  </>,
)

export const IconPlus = svg(<path d="M12 5v14M5 12h14" />)
export const IconChevronLeft = svg(<path d="m15 5-7 7 7 7" />)
export const IconChevronRight = svg(<path d="m9 5 7 7-7 7" />)
export const IconCheck = svg(<path d="m5 13 4.5 4.5L19 6" />)
export const IconClose = svg(<path d="M6 6l12 12M18 6 6 18" />)
export const IconTrash = svg(
  <>
    <path d="M4 7h16M10 7V4.5h4V7M6 7l1 13h10l1-13" />
  </>,
)
export const IconRefresh = svg(
  <>
    <path d="M20 11a8 8 0 1 0-.6 4" />
    <path d="M20 4v7h-7" />
  </>,
)
export const IconDownload = svg(
  <>
    <path d="M12 3v12" />
    <path d="m7.5 10.5 4.5 4.5 4.5-4.5" />
    <path d="M4 20h16" />
  </>,
)
export const IconSheet = svg(
  <>
    <rect x="3.5" y="3.5" width="17" height="17" rx="2.5" />
    <path d="M3.5 9.5h17M3.5 15h17M9.5 3.5v17" />
  </>,
)
