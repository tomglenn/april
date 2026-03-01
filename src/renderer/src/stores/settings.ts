import { create } from 'zustand'
import type { Settings } from '../types'

interface SettingsState {
  settings: Settings | null
  loading: boolean

  load: () => Promise<void>
  update: (partial: Partial<Settings>) => Promise<void>
  applyTheme: (theme: 'dark' | 'light' | 'system') => void
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: null,
  loading: false,

  load: async () => {
    set({ loading: true })
    const s = await window.api.getSettings()
    set({ settings: s, loading: false })
    get().applyTheme(s.theme)
  },

  update: async (partial) => {
    const updated = await window.api.setSettings(partial)
    set({ settings: updated })
    if (partial.theme) get().applyTheme(partial.theme)
  },

  applyTheme: (theme) => {
    const root = document.documentElement
    if (theme === 'dark') {
      root.classList.add('dark')
      root.classList.remove('light')
    } else if (theme === 'light') {
      root.classList.add('light')
      root.classList.remove('dark')
    } else {
      // system
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
      if (prefersDark) {
        root.classList.add('dark')
        root.classList.remove('light')
      } else {
        root.classList.add('light')
        root.classList.remove('dark')
      }
    }
  }
}))

// Reload settings when external sync changes are detected
if (typeof window !== 'undefined' && window.api?.onSyncChanged) {
  window.api.onSyncChanged(() => {
    useSettingsStore.getState().load()
  })
}
