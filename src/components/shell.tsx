import type { ReactNode } from 'react'
import { ThemeToggle } from '@/components/theme-toggle'

/** Page frame: top bar with the wordmark, an optional middle slot, the theme toggle; content; footer. */
export function Shell({
  children,
  middle,
  wide = false,
}: {
  children: ReactNode
  middle?: ReactNode
  wide?: boolean
}) {
  const width = wide ? 'max-w-6xl' : 'max-w-5xl'
  return (
    <div className="bg-background text-foreground flex min-h-screen flex-col">
      <header className="bg-background/90 sticky top-0 z-40 border-b backdrop-blur">
        <div
          className={`mx-auto flex h-14 w-full ${width} items-center justify-between gap-3 px-4`}
        >
          <a
            href="/"
            className="flex items-center gap-2 text-lg font-semibold tracking-tight"
          >
            <BallotMark />
            Voting
          </a>
          <div className="min-w-0 flex-1 truncate text-center text-sm">
            {middle}
          </div>
          <ThemeToggle />
        </div>
      </header>
      <main className={`mx-auto w-full ${width} flex-1 px-4 py-6 sm:py-8`}>
        {children}
      </main>
      <footer className="text-muted-foreground border-t py-6 text-center text-sm">
        <p>
          Vote compasses and live election results.{' '}
          <a
            href="https://github.com/patsissons/voting"
            className="hover:text-foreground underline-offset-4 hover:underline"
          >
            Source on GitHub
          </a>
          {' · '}
          <a
            href="/llms.txt"
            className="hover:text-foreground underline-offset-4 hover:underline"
          >
            For agents
          </a>
        </p>
      </footer>
    </div>
  )
}

function BallotMark() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 64 64"
      aria-hidden="true"
      className="text-brand"
    >
      <rect
        x="10"
        y="30"
        width="44"
        height="26"
        rx="4"
        fill="currentColor"
        opacity="0.25"
      />
      <rect
        x="18"
        y="8"
        width="28"
        height="30"
        rx="3"
        fill="none"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        d="M25 24l5 5 10-11"
        fill="none"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect x="6" y="28" width="52" height="6" rx="3" fill="currentColor" />
    </svg>
  )
}
