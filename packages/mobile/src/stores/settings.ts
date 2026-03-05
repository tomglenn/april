import { create } from 'zustand'
import type { Settings } from '@april/core'
import { readSyncedSettings, writeSyncedSettings, setDataFolder, loadFromFolder, loadSettingsIntoCache } from '../platform/storage'
import { getLocalSettings, setLocalSettings, getFullSettings, setDataFolderBookmark } from '../platform/localSettings'

interface SettingsState {
  settings: Settings | null
  loading: boolean

  load: () => void
  reload: () => Promise<void>
  update: (partial: Partial<Settings>) => Promise<void>
  setDataFolderWithBookmark: (uri: string, bookmark: string) => Promise<void>
}

export const useSettingsStore = create<SettingsState>((set) => ({
  settings: null,
  loading: false,

  load: () => {
    const s = getFullSettings()
    set({ settings: s, loading: false })
  },

  reload: async () => {
    await loadSettingsIntoCache()
    set({ settings: getFullSettings() })
  },

  update: async (partial) => {
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
  },

  // Use this when changing data folder — saves the URI, bookmark, reinitialises storage
  setDataFolderWithBookmark: async (uri, bookmark) => {
    await setLocalSettings({ dataFolder: uri } as Partial<Settings>)
    await setDataFolderBookmark(bookmark)
    setDataFolder(uri)
    await loadFromFolder(uri)
    const updated = getFullSettings()
    set({ settings: updated })
  }
}))
