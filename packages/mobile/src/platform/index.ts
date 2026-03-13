import { setPlatform } from '@april/core'
import type { PlatformAdapter, StorageAdapter } from '@april/core'
import {
  ensureDataDir,
  loadSettingsIntoCache,
  readSyncedSettings,
  writeSyncedSettings,
  getDataFolder,
  setDataFolder,
  readReminders,
  writeReminders
} from './storage'
import { loadLocalSettings, getDataFolderBookmark, setDataFolderBookmark } from './localSettings'
import { notifications } from './notifications'
import { processAdapter } from './process'
import { FolderPickerModule } from '../../modules/folder-picker'

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
  const local = await loadLocalSettings()

  if (local.dataFolder) {
    // Resolve the security-scoped bookmark to regain access after app restart
    const bookmark = await getDataFolderBookmark()
    if (bookmark) {
      try {
        const result = await FolderPickerModule.resolveBookmark(bookmark)
        // If bookmark was stale, persist the refreshed one
        if (result.stale) {
          await setDataFolderBookmark(result.bookmark)
        }
        setDataFolder(result.uri)
      } catch {
        // Bookmark invalid or access denied — fall back to default storage
        setDataFolder(null)
      }
    } else {
      // No bookmark saved (e.g. migrated from old version) — try URI directly
      setDataFolder(local.dataFolder)
    }
  }

  await ensureDataDir()
  await loadSettingsIntoCache()
  setPlatform(mobilePlatform)
}
