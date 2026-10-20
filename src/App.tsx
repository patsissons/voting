import { TipProvider } from '@/components/charts/tooltip'
import { Toaster } from '@/components/ui/sonner'
import { ElectionPage } from '@/views/election-page'
import { IndexPage } from '@/views/index-page'
import { slugFromPath } from '@/lib/route'

export default function App() {
  const slug = slugFromPath(window.location.pathname)
  return (
    <TipProvider>
      {slug ? <ElectionPage slug={slug} /> : <IndexPage />}
      <Toaster />
    </TipProvider>
  )
}
