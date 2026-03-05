import { setPlatform } from '@april/core'
import type { PlatformAdapter, StorageAdapter } from '@april/core'
import {
  ensureDataDir,
  loadSettingsIntoCache,
  readSyncedSettings,
  writeSyncedSettings,
  getDataFolder,
  readReminders,
  writeReminders
} from './storage'
import { loadLocalSettings } from './localSettings'
import { notifications } from './notifications'
import { processAdapter } from './process'

const storage: StorageAdapter = {
  readSyncedSettings,
  writeSyncedSettings,
  getDataFolder,
  ensureDataFolderExists() { /* async version called at init */ },
  readReminders,
  writeReminders
}

const mobilePlatform: PlatformAdapter = {
  storage,
  notifications,
  process: processAdapter
}

export async function initializePlatform(): Promise<void> {
  await ensureDataDir()
  await loadSettingsIntoCache()
  await loadLocalSettings()
  setPlatform(mobilePlatform)
}
