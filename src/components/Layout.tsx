import { Link, Outlet } from 'react-router'

export function Layout() {
  return (
    <div className="bg-background text-foreground flex min-h-screen flex-col">
      <header className="border-b">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between px-4">
          <Link to="/" className="font-semibold">
            voting
          </Link>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        <Outlet />
      </main>
      <footer className="text-muted-foreground border-t py-4 text-center text-sm">
        Powered by PocketHost
      </footer>
    </div>
  )
}
