import { File, Directory, Paths } from 'expo-file-system'
import { SYNCED_DEFAULTS } from '@april/core'
import type { SyncedSettings, Reminder } from '@april/core'

const DATA_DIR = new Directory(Paths.document, 'april-data')
const CONV_DIR = new Directory(DATA_DIR, 'conversations')
const SETTINGS_FILE = new File(DATA_DIR, 'settings.json')
const REMINDERS_FILE = new File(DATA_DIR, 'reminders.json')

const SYNCED_KEYS = Object.keys(SYNCED_DEFAULTS) as (keyof SyncedSettings)[]

// In-memory cache for synchronous reads
let _cachedSettings: SyncedSettings = { ...SYNCED_DEFAULTS }

export function getDataDir(): Directory {
  return DATA_DIR
}

export function getConvDir(): Directory {
  return CONV_DIR
}

export async function ensureDataDir(): Promise<void> {
  if (!DATA_DIR.exists) {
    DATA_DIR.create()
  }
  if (!CONV_DIR.exists) {
    CONV_DIR.create()
  }
}

export async function loadSettingsIntoCache(): Promise<void> {
  try {
    if (SETTINGS_FILE.exists) {
      const raw = await SETTINGS_FILE.text()
      const parsed = JSON.parse(raw)
      const result = { ...SYNCED_DEFAULTS }
      for (const key of SYNCED_KEYS) {
        if (key in parsed) (result as Record<string, unknown>)[key] = parsed[key]
      }
      _cachedSettings = result
    }
  } catch {
    // Use defaults
  }
}

export function readSyncedSettings(): SyncedSettings {
  return { ..._cachedSettings }
}

export function writeSyncedSettings(partial: Partial<SyncedSettings>): SyncedSettings {
  _cachedSettings = { ..._cachedSettings, ...partial }
  // Fire-and-forget write to disk
  SETTINGS_FILE.write(JSON.stringify(_cachedSettings, null, 2))
  return { ..._cachedSettings }
}

export function getDataFolder(): string {
  return DATA_DIR.uri
}

export function readReminders(): Reminder[] {
  return []
}

export function writeReminders(reminders: Reminder[]): void {
  try {
    REMINDERS_FILE.write(JSON.stringify(reminders, null, 2))
  } catch (err) {
    console.warn('[storage] Failed to write reminders:', err)
  }
}
