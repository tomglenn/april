import { ipcMain } from 'electron'
import { store, DEFAULT_SYSTEM_PROMPT } from '../store'
import type { Settings } from '../../renderer/src/types'

export function registerSettingsHandlers(): void {
  ipcMain.handle('settings:get', () => {
    const settings = store.get('settings') as Settings
    // Backfill systemPrompt for existing installs that predate the field
    if (!settings.systemPrompt) {
      settings.systemPrompt = DEFAULT_SYSTEM_PROMPT
      store.set('settings', settings)
    }
    return settings
  })

  ipcMain.handle('settings:set', (_, settings: Partial<Settings>) => {
    const current = store.get('settings') as Settings
    const updated = { ...current, ...settings }
    store.set('settings', updated)
    return updated
  })
}
