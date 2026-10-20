import { NavLink, useNavigate } from 'react-router-dom'
import { Icon, IconName } from '@/components/icons'
import { Logo } from '@/components/Logo'
import { cx } from '@/components/ui'
import { useAuth } from '@/store/auth'
import { useSidebar } from '@/store/sidebar'
import { useTheme } from '@/store/theme'

export const NAV_ITEMS: Array<{ to: string; label: string; icon: IconName; end?: boolean }> = [
  { to: '/app', label: 'Inicio', icon: 'home', end: true },
  { to: '/app/plants', label: 'Explorador vegetal', icon: 'leaf' },
  { to: '/app/projects', label: 'Proyectos', icon: 'folder' },
  { to: '/app/prototypes', label: 'Prototipos', icon: 'cube' },
]

function RailButton({ icon, label, expanded, onClick }: { icon: IconName; label: string; expanded: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={expanded ? undefined : label}
      title={expanded ? undefined : label}
      className="flex h-10 w-full items-center gap-3 rounded-2xl px-3 text-ink-fg/70 hover:bg-white/10 hover:text-ink-fg"
    >
      <Icon name={icon} />
      {expanded && <span className="truncate text-sm font-medium">{label}</span>}
    </button>
  )
}

export function Sidebar({ mobileOpen, onClose }: { mobileOpen: boolean; onClose: () => void }) {
  const { collapsed, toggle } = useSidebar()
  const { theme, toggle: toggleTheme } = useTheme()
  const { user, memberships, organizationId, setOrganization, logout } = useAuth()
  const navigate = useNavigate()
  const expanded = !collapsed || mobileOpen

  return (
    <>
      {mobileOpen && <div data-testid="sidebar-overlay" className="fixed inset-0 z-30 bg-black/40 md:hidden" onClick={onClose} />}
      <aside
        className={cx(
          'fixed inset-y-3 left-3 z-40 flex-col rounded-3xl bg-ink p-2.5 text-ink-fg transition-[width] duration-200 md:sticky md:top-3 md:flex md:h-[calc(100vh-1.5rem)]',
          mobileOpen ? 'flex w-[232px]' : 'hidden',
          collapsed ? 'md:w-16' : 'md:w-[232px]',
        )}
      >
        <NavLink to="/app" onClick={onClose} className="mb-6 flex h-11 items-center gap-2 px-2.5" aria-label="HarvestT Cortex">
          {expanded ? <Logo withCortex cortexClassName="text-ink-fg/60" /> : <Logo compact />}
        </NavLink>
        <nav aria-label="Principal" className="flex flex-1 flex-col gap-1">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={onClose}
              aria-label={expanded ? undefined : item.label}
              title={expanded ? undefined : item.label}
              className={({ isActive }) =>
                cx(
                  'flex h-11 items-center gap-3 rounded-2xl px-3 transition-colors',
                  isActive ? 'bg-lime text-ink' : 'text-ink-fg/70 hover:bg-white/10 hover:text-ink-fg',
                )
              }
            >
              <Icon name={item.icon} />
              {expanded && <span className="truncate text-sm font-semibold">{item.label}</span>}
            </NavLink>
          ))}
          <NavLink
            to="/"
            aria-label={expanded ? undefined : 'Ver vitrina pública'}
            title={expanded ? undefined : 'Ver vitrina pública'}
            className="mt-auto flex h-11 items-center gap-3 rounded-2xl px-3 text-ink-fg/70 hover:bg-white/10 hover:text-ink-fg"
          >
            <Icon name="globe" />
            {expanded && <span className="truncate text-sm font-medium">Ver vitrina pública</span>}
          </NavLink>
        </nav>
        <div className="mt-2 space-y-1 border-t border-white/10 pt-2">
          {expanded && memberships.length > 1 && (
            <select
              aria-label="Organización activa"
              value={organizationId ?? ''}
              onChange={(e) => {
                setOrganization(e.target.value)
                window.location.reload()
              }}
              className="mb-1 w-full rounded-xl bg-white/10 px-2 py-1.5 text-xs text-ink-fg"
            >
              {memberships.map((m) => (
                <option key={m.organization.id} value={m.organization.id} className="text-fg">
                  {m.organization.name}
                </option>
              ))}
            </select>
          )}
          {expanded && user?.email && <p className="truncate px-3 py-1 text-xs text-ink-fg/50">{user.email}</p>}
          <RailButton icon={theme === 'dark' ? 'sun' : 'moon'} label={theme === 'dark' ? 'Tema claro' : 'Tema oscuro'} expanded={expanded} onClick={toggleTheme} />
          <RailButton
            icon="logout"
            label="Salir"
            expanded={expanded}
            onClick={() => {
              logout()
              navigate('/login')
            }}
          />
          <button
            type="button"
            onClick={toggle}
            aria-label={collapsed ? 'Expandir menú' : 'Plegar menú'}
            className="hidden h-10 w-full items-center justify-center rounded-2xl text-ink-fg/60 hover:bg-white/10 md:flex"
          >
            <Icon name="chevron" className={cx('h-4 w-4 transition-transform', !collapsed && 'rotate-180')} />
          </button>
        </div>
      </aside>
    </>
  )
}
