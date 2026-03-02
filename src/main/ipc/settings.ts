import { ipcMain, dialog, BrowserWindow } from 'electron'
import {
  localStore,
  getSettings,
  setSyncedSettings,
  getDataFolder,
  ensureDataFolderExists,
  notifyDataFolderChanged,
  DEFAULT_SYSTEM_PROMPT
} from '../store'
import { mcpManager } from '../mcp'
import type { Settings, LocalSettings, SyncedSettings } from '../../renderer/src/types'

// Keys that belong in localStore (never synced)
const LOCAL_KEYS: (keyof LocalSettings)[] = [
  'anthropicApiKey',
  'openaiApiKey',
  'ollamaBaseUrl',
  'setupCompleted',
  'dataFolder'
]

export function registerSettingsHandlers(): void {
  ipcMain.handle('settings:get', () => {
    const settings = getSettings()
    // Backfill fields for existing installs that predate them
    if (!settings.systemPrompt) {
      setSyncedSettings({ systemPrompt: DEFAULT_SYSTEM_PROMPT })
      settings.systemPrompt = DEFAULT_SYSTEM_PROMPT
    }
    if (!settings.mcpServers) {
      setSyncedSettings({ mcpServers: [] })
      settings.mcpServers = []
    }
    return settings
  })

  ipcMain.handle('settings:set', (_, settings: Partial<Settings>) => {
    // Split incoming settings into local vs synced
    const localPart: Partial<LocalSettings> = {}
    const syncedPart: Partial<SyncedSettings> = {}

    for (const [key, value] of Object.entries(settings)) {
      if (LOCAL_KEYS.includes(key as keyof LocalSettings)) {
        ;(localPart as Record<string, unknown>)[key] = value
      } else {
        ;(syncedPart as Record<string, unknown>)[key] = value
      }
    }

    // Write local settings
    for (const [key, value] of Object.entries(localPart)) {
      localStore.set(key as keyof LocalSettings, value as never)
    }

    // Write synced settings
    if (Object.keys(syncedPart).length > 0) {
      setSyncedSettings(syncedPart)
    }

    // Sync MCP servers whenever settings change
    const updated = getSettings()
    if (updated.mcpServers) {
      mcpManager.syncServers(updated.mcpServers).catch(() => {})
    }
    return updated
  })

  ipcMain.handle('settings:getDataFolder', () => {
    return getDataFolder()
  })

  ipcMain.handle('settings:pickDataFolder', async (event) => {
    const win = BrowserWindow.getFocusedWindow()
    if (!win) return null
    const result = await dialog.showOpenDialog(win, {
      properties: ['openDirectory', 'createDirectory'],
      title: 'Choose Data Folder',
      message: 'Choose a folder to store conversations and settings. Use an iCloud Drive or Dropbox folder to sync across devices.'
    })
    if (result.canceled || result.filePaths.length === 0) return null
    const newPath = result.filePaths[0]
    localStore.set('dataFolder', newPath)
    ensureDataFolderExists()
    // Reload settings + conversations from the new folder
    event.sender.send('sync:changed')
    // Restart file watcher for the new location
    notifyDataFolderChanged()
    return newPath
  })

  ipcMain.handle('mcp:status', () => mcpManager.getStatus())
}
