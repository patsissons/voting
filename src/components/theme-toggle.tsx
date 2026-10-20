import { Moon, Sun } from 'lucide-react'
import { useTheme } from '@/lib/theme'

export function ThemeToggle() {
  const [theme, toggle] = useTheme()
  const next = theme === 'dark' ? 'light' : 'dark'
  const Icon = theme === 'dark' ? Sun : Moon

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={`Switch to ${next} mode`}
      title={`Switch to ${next} mode`}
      className="bg-card text-muted-foreground hover:border-primary/50 hover:text-foreground focus-visible:ring-ring inline-flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-full border transition focus-visible:ring-2 focus-visible:outline-none"
    >
      <Icon className="size-5" />
    </button>
  )
}
