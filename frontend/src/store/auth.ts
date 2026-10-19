import { create } from 'zustand'
import { readStorage, writeStorage } from './storage'

export type Role = 'viewer' | 'editor' | 'admin'

export interface Organization {
  id: string
  name: string
  slug: string
}

export interface Membership {
  organization: Organization
  role: Role
}

export interface User {
  id: string
  email: string
  full_name: string
  is_superadmin: boolean
}

interface AuthState {
  token: string | null
  organizationId: string | null
  user: User | null
  memberships: Membership[]
  setSession: (token: string, user: User, memberships: Membership[]) => void
  setProfile: (user: User, memberships: Membership[]) => void
  setOrganization: (id: string) => void
  logout: () => void
}

const TOKEN_KEY = 'harvestt_token'
const ORG_KEY = 'harvestt_org_id'

export const useAuth = create<AuthState>((set, get) => ({
  token: readStorage(TOKEN_KEY),
  organizationId: readStorage(ORG_KEY),
  user: null,
  memberships: [],
  setSession: (token, user, memberships) => {
    writeStorage(TOKEN_KEY, token)
    set({ token, user, memberships })
    get().setProfile(user, memberships)
  },
  setProfile: (user, memberships) => {
    const current = get().organizationId
    const valid = memberships.some((m) => m.organization.id === current)
    const organizationId = valid ? current : memberships[0]?.organization.id ?? null
    writeStorage(ORG_KEY, organizationId)
    set({ user, memberships, organizationId })
  },
  setOrganization: (id) => {
    writeStorage(ORG_KEY, id)
    set({ organizationId: id })
  },
  logout: () => {
    writeStorage(TOKEN_KEY, null)
    set({ token: null, user: null, memberships: [] })
  },
}))

const RANK: Record<Role, number> = { viewer: 0, editor: 1, admin: 2 }

/** ¿El usuario tiene al menos este rol en la organización activa? */
export function useHasRole(minimum: Role): boolean {
  return useAuth((s) => {
    if (s.user?.is_superadmin) return true
    const m = s.memberships.find((x) => x.organization.id === s.organizationId)
    return m ? RANK[m.role] >= RANK[minimum] : false
  })
}
