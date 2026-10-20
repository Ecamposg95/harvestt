import { useCallback, useEffect, useRef, useState } from 'react'
import { Outlet } from 'react-router-dom'
import { api } from '@/api/client'
import { Icon } from '@/components/icons'
import { Logo } from '@/components/Logo'
import { Sidebar } from '@/components/Sidebar'
import { Membership, User, useAuth } from '@/store/auth'

export function AppLayout() {
  const { user, setProfile } = useAuth()
  const [mobileOpen, setMobileOpen] = useState(false)
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const closeDrawer = useCallback(() => {
    setMobileOpen(false)
    menuButtonRef.current?.focus()
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const mq = window.matchMedia('(min-width: 768px)')
    const onChange = (e: MediaQueryListEvent) => {
      if (e.matches) setMobileOpen(false)
    }
    mq.addEventListener?.('change', onChange)
    return () => mq.removeEventListener?.('change', onChange)
  }, [])

  useEffect(() => {
    if (user) return
    api
      .get<{ user: User; memberships: Membership[] }>('/auth/me')
      .then((res) => setProfile(res.data.user, res.data.memberships))
      .catch(() => undefined)
  }, [user, setProfile])

  return (
    <div className="flex min-h-screen gap-3 p-3">
      <Sidebar mobileOpen={mobileOpen} onClose={closeDrawer} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="glass mb-3 flex h-14 items-center gap-3 px-3 md:hidden">
          <button ref={menuButtonRef} onClick={() => setMobileOpen(true)} className="rounded-full p-2 hover:bg-surface" aria-label="Abrir menú">
            <Icon name="menu" />
          </button>
          <Logo withCortex dotClassName="h-5 w-5" />
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 px-1 py-4 sm:px-4">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
