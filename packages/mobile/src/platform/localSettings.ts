import * as SecureStore from 'expo-secure-store'
import type { LocalSettings, Settings } from '@april/core'
import { readSyncedSettings } from './storage'

const KEYS: (keyof LocalSettings)[] = ['anthropicApiKey', 'openaiApiKey', 'ollamaBaseUrl', 'setupCompleted', 'dataFolder']
const BOOKMARK_KEY = 'april_dataFolderBookmark'

const LOCAL_DEFAULTS: LocalSettings = {
  anthropicApiKey: '',
  openaiApiKey: '',
  ollamaBaseUrl: 'http://localhost:11434',
  setupCompleted: false,
  dataFolder: ''
}

let _cachedLocal: LocalSettings = { ...LOCAL_DEFAULTS }

export async function loadLocalSettings(): Promise<LocalSettings> {
  for (const key of KEYS) {
    try {
      const val = await SecureStore.getItemAsync(`april_${key}`)
      if (val !== null) {
        if (key === 'setupCompleted') {
          (_cachedLocal as Record<string, unknown>)[key] = val === 'true'
        } else {
          (_cachedLocal as Record<string, unknown>)[key] = val
        }
      }
    } catch {
      // ignore
    }
  }
  return { ..._cachedLocal }
}

export function getLocalSettings(): LocalSettings {
  return { ..._cachedLocal }
}

export async function setLocalSettings(partial: Partial<LocalSettings>): Promise<void> {
  for (const [key, value] of Object.entries(partial)) {
    const storageKey = `april_${key}`
    const storageValue = typeof value === 'boolean' ? String(value) : String(value ?? '')
    await SecureStore.setItemAsync(storageKey, storageValue)
    ;(_cachedLocal as Record<string, unknown>)[key] = value
  }
}

export async function getDataFolderBookmark(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(BOOKMARK_KEY)
  } catch {
    return null
  }
}

export async function setDataFolderBookmark(bookmark: string | null): Promise<void> {
  try {
    if (bookmark) {
      await SecureStore.setItemAsync(BOOKMARK_KEY, bookmark)
    } else {
      await SecureStore.deleteItemAsync(BOOKMARK_KEY)
    }
  } catch {
    // ignore
  }
}

export function getFullSettings(): Settings {
  return { ..._cachedLocal, ...readSyncedSettings() }
}
