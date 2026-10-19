import { useEffect, useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { api } from '@/api/client'
import { Logo } from '@/components/Logo'
import { cx } from '@/components/ui'
import { Membership, User, useAuth } from '@/store/auth'
import { useTheme } from '@/store/theme'

const NAV = [
  { to: '/app', label: 'Inicio', end: true },
  { to: '/app/plants', label: 'Explorador vegetal' },
  { to: '/app/projects', label: 'Proyectos' },
  { to: '/app/prototypes', label: 'Prototipos' },
]

export function AppLayout() {
  const { user, memberships, organizationId, setProfile, setOrganization, logout } = useAuth()
  const { theme, toggle } = useTheme()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    if (user) return
    api
      .get<{ user: User; memberships: Membership[] }>('/auth/me')
      .then((res) => setProfile(res.data.user, res.data.memberships))
      .catch(() => undefined)
  }, [user, setProfile])

  const signOut = () => {
    logout()
    navigate('/login')
  }

  return (
    <div className="flex min-h-screen bg-bg">
      <aside
        className={cx(
          'fixed inset-y-0 left-0 z-40 w-64 flex-col border-r border-border bg-surface p-4 md:static md:flex',
          menuOpen ? 'flex' : 'hidden',
        )}
      >
        <NavLink to="/app" className="mb-8 px-2" onClick={() => setMenuOpen(false)}>
          <Logo />
        </NavLink>
        <nav className="flex flex-1 flex-col gap-1" aria-label="Principal">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={() => setMenuOpen(false)}
              className={({ isActive }) =>
                cx(
                  'rounded-md px-3 py-2 text-sm transition-colors',
                  isActive ? 'bg-accent/10 font-medium text-accent' : 'text-muted hover:bg-raised hover:text-fg',
                )
              }
            >
              {item.label}
            </NavLink>
          ))}
          <NavLink to="/" className="mt-auto rounded-md px-3 py-2 text-sm text-muted hover:bg-raised hover:text-fg">
            Ver vitrina pública ↗
          </NavLink>
        </nav>
        <div className="mt-4 space-y-3 border-t border-border pt-4">
          {memberships.length > 1 && (
            <select
              aria-label="Organización activa"
              value={organizationId ?? ''}
              onChange={(e) => {
                setOrganization(e.target.value)
                window.location.reload()
              }}
              className="w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm"
            >
              {memberships.map((m) => (
                <option key={m.organization.id} value={m.organization.id}>
                  {m.organization.name}
                </option>
              ))}
            </select>
          )}
          <p className="truncate px-1 text-xs text-muted">{user?.email}</p>
          <div className="flex gap-2">
            <button onClick={toggle} className="flex-1 rounded-md border border-border px-2 py-1.5 text-xs hover:bg-raised">
              {theme === 'dark' ? 'Tema claro' : 'Tema oscuro'}
            </button>
            <button onClick={signOut} className="flex-1 rounded-md border border-border px-2 py-1.5 text-xs hover:bg-raised">
              Salir
            </button>
          </div>
        </div>
      </aside>
      {menuOpen && <div className="fixed inset-0 z-30 bg-black/40 md:hidden" onClick={() => setMenuOpen(false)} />}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center border-b border-border px-4 md:hidden">
          <button onClick={() => setMenuOpen(true)} className="rounded-md border border-border px-3 py-1.5 text-sm" aria-label="Abrir menú">
            Menú
          </button>
          <span className="ml-3">
            <Logo />
          </span>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
