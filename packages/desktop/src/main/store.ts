import Store from 'electron-store'
import { app } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, unlinkSync } from 'fs'
import { SYNCED_DEFAULTS } from '@april/core'
import type { Conversation, LocalSettings, SyncedSettings, Settings } from '@april/core'

// Re-export for backward compatibility
export { DEFAULT_SYSTEM_PROMPT } from '@april/core'

// ── Local store (electron-store, never synced) ──────────────────────────────

const APP_DATA_DIR = join(app.getPath('appData'), app.isPackaged ? 'april-agent' : 'april-agent-dev')

const localDefaults: LocalSettings = {
  anthropicApiKey: '',
  openaiApiKey: '',
  ollamaBaseUrl: 'http://localhost:11434',
  setupCompleted: false,
  dataFolder: APP_DATA_DIR
}

export const localStore = new Store<LocalSettings>({
  defaults: localDefaults,
  name: 'local',
  cwd: APP_DATA_DIR
})

// ── Synced settings ({dataFolder}/config.json) ─────────────────────────────

export function getDataFolder(): string {
  return localStore.get('dataFolder') || APP_DATA_DIR
}

function syncConfigPath(): string {
  return join(getDataFolder(), 'settings.json')
}

function conversationsDir(): string {
  return join(getDataFolder(), 'conversations')
}

export function ensureDataFolderExists(): void {
  const dir = getDataFolder()
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const convDir = conversationsDir()
  if (!existsSync(convDir)) mkdirSync(convDir, { recursive: true })
}

// ── Data-folder-changed callback (set by index.ts, called by settings.ts) ───

let onDataFolderChanged: (() => void) | null = null
export function setOnDataFolderChanged(cb: () => void): void { onDataFolderChanged = cb }
export function notifyDataFolderChanged(): void { onDataFolderChanged?.() }

// ── Own-write tracking (to suppress self-triggered fs.watch events) ─────────

let lastOwnWriteTime = 0

export function markOwnWrite(): void {
  lastOwnWriteTime = Date.now()
}

export function isOwnRecentWrite(): boolean {
  return Date.now() - lastOwnWriteTime < 2000
}

// ── Synced settings read/write ──────────────────────────────────────────────

const SYNCED_KEYS = Object.keys(SYNCED_DEFAULTS) as (keyof SyncedSettings)[]

export function getSyncedSettings(): SyncedSettings {
  const path = syncConfigPath()
  if (!existsSync(path)) return { ...SYNCED_DEFAULTS }
  try {
    const raw = JSON.parse(readFileSync(path, 'utf-8'))
    // Only pick known synced keys — ignore stray keys like windowBounds
    const result = { ...SYNCED_DEFAULTS }
    for (const key of SYNCED_KEYS) {
      if (key in raw) (result as Record<string, unknown>)[key] = raw[key]
    }
    return result
  } catch {
    return { ...SYNCED_DEFAULTS }
  }
}

export function setSyncedSettings(partial: Partial<SyncedSettings>): SyncedSettings {
  ensureDataFolderExists()
  const current = getSyncedSettings()
  const updated = { ...current, ...partial }
  markOwnWrite()
  writeFileSync(syncConfigPath(), JSON.stringify(updated, null, 2), 'utf-8')
  return updated
}

// ── Combined settings for renderer ──────────────────────────────────────────

export function getSettings(): Settings {
  const local = localStore.store
  const synced = getSyncedSettings()
  return { ...local, ...synced }
}

// ── Conversation file operations ────────────────────────────────────────────

function convPath(id: string): string {
  return join(conversationsDir(), `${id}.json`)
}

export function listConversations(): Conversation[] {
  const dir = conversationsDir()
  if (!existsSync(dir)) return []
  const files = readdirSync(dir).filter((f) => f.endsWith('.json'))
  const convs: Conversation[] = []
  for (const file of files) {
    try {
      const raw = readFileSync(join(dir, file), 'utf-8')
      convs.push(JSON.parse(raw))
    } catch {
      // skip corrupt files
    }
  }
  convs.sort((a, b) => b.updatedAt - a.updatedAt)
  return convs
}

export function getConversation(id: string): Conversation | null {
  const path = convPath(id)
  if (!existsSync(path)) return null
  try {
    return JSON.parse(readFileSync(path, 'utf-8'))
  } catch {
    return null
  }
}

export function saveConversation(conv: Conversation): void {
  ensureDataFolderExists()
  markOwnWrite()
  writeFileSync(convPath(conv.id), JSON.stringify(conv, null, 2), 'utf-8')
}

export function deleteConversation(id: string): void {
  const path = convPath(id)
  if (existsSync(path)) {
    markOwnWrite()
    unlinkSync(path)
  }
}

// Legacy config.json path (for migration detection)
export const LEGACY_CONFIG_PATH = join(APP_DATA_DIR, 'config.json')
