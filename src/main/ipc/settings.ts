import { ipcMain } from 'electron'
import { store, DEFAULT_SYSTEM_PROMPT } from '../store'
import { mcpManager } from '../mcp'
import type { Settings } from '../../renderer/src/types'

export function registerSettingsHandlers(): void {
  ipcMain.handle('settings:get', () => {
    const settings = store.get('settings') as Settings
    // Backfill fields for existing installs that predate them
    if (!settings.systemPrompt) {
      settings.systemPrompt = DEFAULT_SYSTEM_PROMPT
      store.set('settings', settings)
    }
    if (!settings.mcpServers) {
      settings.mcpServers = []
      store.set('settings', settings)
    }
    return settings
  })

  ipcMain.handle('settings:set', (_, settings: Partial<Settings>) => {
    const current = store.get('settings') as Settings
    const updated = { ...current, ...settings }
    store.set('settings', updated)
    // Sync MCP servers whenever settings change
    if (updated.mcpServers) {
      mcpManager.syncServers(updated.mcpServers).catch(() => {})
    }
    return updated
  })

  ipcMain.handle('mcp:status', () => mcpManager.getStatus())
}
