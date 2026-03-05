import { create } from 'zustand'
import type { Settings } from '@april/core'
import { readSyncedSettings, writeSyncedSettings } from '../platform/storage'
import { getLocalSettings, setLocalSettings, getFullSettings } from '../platform/localSettings'

interface SettingsState {
  settings: Settings | null
  loading: boolean

  load: () => void
  update: (partial: Partial<Settings>) => Promise<void>
}

export const useSettingsStore = create<SettingsState>((set) => ({
  settings: null,
  loading: false,

  load: () => {
    const s = getFullSettings()
    set({ settings: s, loading: false })
  },

  update: async (partial) => {
    // Split into local and synced
    const localKeys = ['anthropicApiKey', 'openaiApiKey', 'ollamaBaseUrl', 'setupCompleted', 'dataFolder', 'windowBounds'] as const
    const localPartial: Record<string, unknown> = {}
    const syncedPartial: Record<string, unknown> = {}

    for (const [key, value] of Object.entries(partial)) {
      if ((localKeys as readonly string[]).includes(key)) {
        localPartial[key] = value
      } else {
        syncedPartial[key] = value
      }
    }

    if (Object.keys(localPartial).length > 0) {
      await setLocalSettings(localPartial as Partial<Settings>)
    }
    if (Object.keys(syncedPartial).length > 0) {
      writeSyncedSettings(syncedPartial)
    }

    const updated = getFullSettings()
    set({ settings: updated })
  }
}))
