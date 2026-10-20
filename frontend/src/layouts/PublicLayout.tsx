import { Link, Outlet } from 'react-router-dom'
import { useAuth } from '@/store/auth'

export function PublicLayout() {
  const token = useAuth((s) => s.token)
  return (
    <div className="min-h-screen text-fg">
      <header className="fixed inset-x-0 top-0 z-30 px-3 pt-3">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-2 sm:px-4">
          <Link to="/" aria-label="Inicio" className="flex items-center gap-2 font-extrabold tracking-tight">
            <span className="h-5 w-5 rounded-full bg-lime" />
            HarvestT
          </Link>
          <nav className="flex items-center gap-2 text-sm">
            <Link to="/" className="glass !rounded-full px-4 py-2 font-semibold">
              Prototipos
            </Link>
            <Link to={token ? '/app' : '/login'} className="rounded-full bg-ink px-4 py-2 font-semibold text-ink-fg">
              {token ? 'Plataforma' : 'Iniciar sesión'}
            </Link>
          </nav>
        </div>
      </header>
      <main className="pt-20">
        <Outlet />
      </main>
      <footer className="py-10 text-center text-xs text-muted">HarvestT · General Systech · Atlas Tech</footer>
    </div>
  )
}
