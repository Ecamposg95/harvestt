import { Link, Outlet } from 'react-router-dom'
import { Logo } from '@/components/Logo'
import { useAuth } from '@/store/auth'

export function PublicLayout() {
  const token = useAuth((s) => s.token)
  return (
    <div className="dark min-h-screen bg-bg text-fg">
      <header className="fixed inset-x-0 top-0 z-30 border-b border-border/60 bg-bg/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6">
          <Link to="/" aria-label="Inicio">
            <Logo />
          </Link>
          <nav className="flex items-center gap-5 text-sm">
            <Link to="/" className="text-muted hover:text-fg">
              Prototipos
            </Link>
            <Link to={token ? '/app' : '/login'} className="rounded-md border border-border px-3 py-1.5 hover:bg-raised">
              {token ? 'Plataforma' : 'Iniciar sesión'}
            </Link>
          </nav>
        </div>
      </header>
      <main className="pt-14">
        <Outlet />
      </main>
      <footer className="border-t border-border/60 py-8 text-center font-mono text-xs text-muted">
        HarvestT · General Systech · Atlas Tech
      </footer>
    </div>
  )
}
