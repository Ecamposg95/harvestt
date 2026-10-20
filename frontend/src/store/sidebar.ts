import { create } from 'zustand'
import { readStorage, writeStorage } from './storage'

const KEY = 'harvestt_sidebar'

export const useSidebar = create<{ collapsed: boolean; toggle: () => void }>((set, get) => ({
  collapsed: readStorage(KEY) !== '0',
  toggle: () => {
    const collapsed = !get().collapsed
    writeStorage(KEY, collapsed ? '1' : '0')
    set({ collapsed })
  },
}))
