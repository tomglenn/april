import { Paths } from 'expo-file-system'
import { SYNCED_DEFAULTS } from '@april/core'
import type { SyncedSettings, Reminder } from '@april/core'
import { FolderPickerModule } from '../../modules/folder-picker'

const SYNCED_KEYS = Object.keys(SYNCED_DEFAULTS) as (keyof SyncedSettings)[]

// All paths are string URIs. Default points to app sandbox; overridden by user folder selection.
let _dataDir: string
let _convDir: string
let _settingsFile: string
let _remindersFile: string

function initStoragePaths(folderUri?: string): void {
  const base = folderUri
    ? (folderUri.endsWith('/') ? folderUri : folderUri + '/')
    : (Paths.document + '/april-data/')
  _dataDir = base
  _convDir = base + 'conversations/'
  _settingsFile = base + 'settings.json'
  _remindersFile = base + 'reminders.json'
}

initStoragePaths()

let _cachedSettings: SyncedSettings = { ...SYNCED_DEFAULTS }

export function setDataFolder(uri: string | null): void {
  initStoragePaths(uri && uri.length > 0 ? uri : undefined)
}

export async function hasAprilData(folderUri: string): Promise<boolean> {
  try {
    const base = folderUri.endsWith('/') ? folderUri : folderUri + '/'
    const result = await FolderPickerModule.readFile(base + 'settings.json')
    return result !== null
  } catch {
    return false
  }
}

export async function loadFromFolder(folderUri: string): Promise<void> {
  initStoragePaths(folderUri && folderUri.length > 0 ? folderUri : undefined)
  await ensureDataDir()
  await loadSettingsIntoCache()
}

export function getDataDir(): string {
  return _dataDir
}

export function getConvDir(): string {
  return _convDir
}

export async function ensureDataDir(): Promise<void> {
  await FolderPickerModule.createDirectory(_dataDir)
  await FolderPickerModule.createDirectory(_convDir)
}

export async function loadSettingsIntoCache(): Promise<void> {
  try {
    const raw = await FolderPickerModule.readFile(_settingsFile)
    if (raw) {
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
  FolderPickerModule.writeFile(_settingsFile, JSON.stringify(_cachedSettings, null, 2))
    .catch((err) => console.warn('[storage] Failed to write settings:', err))
  return { ..._cachedSettings }
}

export function getDataFolder(): string {
  return _dataDir
}

export function readReminders(): Reminder[] {
  return []
}

export function writeReminders(reminders: Reminder[]): void {
  FolderPickerModule.writeFile(_remindersFile, JSON.stringify(reminders, null, 2))
    .catch((err) => console.warn('[storage] Failed to write reminders:', err))
}
