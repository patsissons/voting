import { Shell } from '@/components/shell'

export default function App() {
  return (
    <Shell>
      <section className="space-y-3">
        <h1 className="text-3xl font-bold tracking-tight">Elections</h1>
        <p className="text-muted-foreground max-w-prose">
          Vote compasses and live election results. The elections index, compass
          and results views arrive in the next rounds.
        </p>
      </section>
    </Shell>
  )
}
