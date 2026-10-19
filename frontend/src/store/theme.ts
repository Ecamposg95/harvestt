import { create } from 'zustand'
import { readStorage, writeStorage } from './storage'

type Theme = 'light' | 'dark'

const initial = (readStorage('harvestt_theme') as Theme | null) ?? 'dark'

function apply(theme: Theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark')
}
apply(initial)

export const useTheme = create<{ theme: Theme; toggle: () => void }>((set, get) => ({
  theme: initial,
  toggle: () => {
    const theme: Theme = get().theme === 'dark' ? 'light' : 'dark'
    writeStorage('harvestt_theme', theme)
    apply(theme)
    set({ theme })
  },
}))
