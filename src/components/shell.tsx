import type { ReactNode } from 'react'
import { ThemeToggle } from '@/components/theme-toggle'

/** Page frame: top bar with the wordmark and theme toggle, content, footer. */
export function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="bg-background text-foreground flex min-h-screen flex-col">
      <header className="border-b">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between px-4">
          <a href="/" className="text-lg font-semibold tracking-tight">
            Voting
          </a>
          <ThemeToggle />
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        {children}
      </main>
      <footer className="text-muted-foreground border-t py-4 text-center text-sm">
        <a
          href="https://github.com/patsissons/voting"
          className="hover:text-foreground underline-offset-4 hover:underline"
        >
          Source on GitHub
        </a>
      </footer>
    </div>
  )
}
