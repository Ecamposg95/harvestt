import { Link, Outlet } from 'react-router-dom'
import { Logo } from '@/components/Logo'
import { useAuth } from '@/store/auth'

export function PublicLayout() {
  const token = useAuth((s) => s.token)
  return (
    <div className="min-h-screen text-fg">
      <header className="fixed inset-x-0 top-0 z-30 px-3 pt-3">
        <div className="glass mx-auto flex h-14 max-w-7xl items-center justify-between !rounded-full px-4 sm:px-5">
          <Link to="/" aria-label="Inicio" className="flex items-center">
            <Logo dotClassName="h-5 w-5" />
          </Link>
          <nav className="flex items-center gap-1.5 text-xs sm:gap-2 sm:text-sm">
            <Link to="/" className="glass whitespace-nowrap !rounded-full px-3 py-1.5 font-semibold sm:px-4 sm:py-2">
              Prototipos
            </Link>
            <Link to={token ? '/app' : '/login'} className="whitespace-nowrap rounded-full bg-ink px-3 py-1.5 font-semibold text-ink-fg sm:px-4 sm:py-2">
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
