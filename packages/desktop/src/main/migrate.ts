import { app } from 'electron'
import { join } from 'path'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import {
  getDataFolder,
  setSyncedSettings,
  ensureDataFolderExists,
  saveConversation,
  LEGACY_CONFIG_PATH
} from './store'
import { localStore } from './store'
import type { Conversation, Settings } from '@april/core'

export function runMigrationIfNeeded(): void {
  const localPath = join(app.getPath('appData'), 'april-agent', 'local.json')
  const settingsJsonPath = join(getDataFolder(), 'settings.json')

  // If local.json exists but settings.json doesn't, a previous buggy migration
  // may have run (when synced config was written to config.json then overwritten).
  // Re-extract synced settings from the legacy config.json.
  if (existsSync(localPath) && !existsSync(settingsJsonPath) && existsSync(LEGACY_CONFIG_PATH)) {
    try {
      const legacy = JSON.parse(readFileSync(LEGACY_CONFIG_PATH, 'utf-8'))
      const s = legacy.settings
      if (s) {
        console.log('[migration] Recovering synced settings to settings.json...')
        setSyncedSettings({
          defaultProvider: s.defaultProvider || 'anthropic',
          defaultModel: s.defaultModel || 'claude-sonnet-4-6',
          theme: s.theme || 'dark',
          userName: s.userName || '',
          userLocation: s.userLocation || '',
          userBio: s.userBio || '',
          mcpServers: s.mcpServers || []
        })
      }
    } catch {
      // non-critical
    }
    return
  }

  // Check if we already have a local.json — if so, migration is done
  if (existsSync(localPath)) return

  // Check if the legacy config.json exists and has data
  if (!existsSync(LEGACY_CONFIG_PATH)) return

  let legacy: { conversations?: Conversation[]; settings?: Settings; windowBounds?: { x: number; y: number; width: number; height: number } }
  try {
    legacy = JSON.parse(readFileSync(LEGACY_CONFIG_PATH, 'utf-8'))
  } catch {
    return
  }

  if (!legacy.settings && !legacy.conversations?.length) return

  console.log('[migration] Migrating from legacy config.json...')

  const settings = legacy.settings
  if (settings) {
    // Local settings
    localStore.set('anthropicApiKey', settings.anthropicApiKey || '')
    localStore.set('openaiApiKey', settings.openaiApiKey || '')
    localStore.set('ollamaBaseUrl', settings.ollamaBaseUrl || 'http://localhost:11434')
    localStore.set('setupCompleted', settings.setupCompleted ?? false)
    // dataFolder defaults to APP_DATA_DIR already

    // Synced settings
    setSyncedSettings({
      defaultProvider: settings.defaultProvider || 'anthropic',
      defaultModel: settings.defaultModel || 'claude-sonnet-4-6',
      theme: settings.theme || 'dark',
      userName: settings.userName || '',
      userLocation: settings.userLocation || '',
      userBio: settings.userBio || '',
      mcpServers: settings.mcpServers || []
    })
  }

  if (legacy.windowBounds) {
    localStore.set('windowBounds', legacy.windowBounds)
  }

  // Migrate conversations to individual files
  if (legacy.conversations?.length) {
    ensureDataFolderExists()
    for (const conv of legacy.conversations) {
      saveConversation(conv)
    }
    console.log(`[migration] Migrated ${legacy.conversations.length} conversations`)
  }

  // Clear conversations from legacy store to free space, keep the file for reference
  try {
    const cleaned = { ...legacy, conversations: [], _migrated: true }
    writeFileSync(LEGACY_CONFIG_PATH, JSON.stringify(cleaned, null, 2), 'utf-8')
  } catch {
    // non-critical
  }

  console.log('[migration] Done.')
}
