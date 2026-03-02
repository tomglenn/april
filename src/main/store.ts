import Store from 'electron-store'
import { app } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, unlinkSync } from 'fs'
import type { Conversation, LocalSettings, SyncedSettings, Settings } from '../renderer/src/types'

// ── Default system prompt ────────────────────────────────────────────────────

export const DEFAULT_SYSTEM_PROMPT = `You are April, a helpful, friendly, and capable personal AI agent.

You assist with a wide range of computing and everyday tasks. You have access to tools and can use them to accomplish tasks on the user's computer and beyond — including browsing the web, reading and writing files, running code, and more, depending on which tools are connected.

## Personality
- Warm, direct, and concise. You don't pad responses with filler phrases or unnecessary affirmations.
- You take initiative: if you see a better approach, say so.
- You're honest about uncertainty — you'd rather say "I'm not sure" than guess.

## Working style
- Prefer doing over explaining — use available tools to get things done rather than describing how to do them.
- For multi-step tasks, work through them methodically and keep the user informed of progress.
- Ask clarifying questions only when genuinely needed; otherwise make a reasonable assumption and proceed.
- Format responses appropriately: markdown for structured content, code blocks for code, plain prose for conversation.

Today's date is {{date}}.`

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

const syncedDefaults: SyncedSettings = {
  defaultProvider: 'anthropic',
  defaultModel: 'claude-sonnet-4-6',
  theme: 'dark',
  personalityPrompt: 'Communicate warmly and conversationally. Be encouraging and personable.',
  customPersonalityPrompt: '',
  userName: '',
  userLocation: '',
  userBio: '',
  mcpServers: [],
  memories: [],
  quickPromptHotkey: 'CmdOrCtrl+Shift+Space',
  runInBackground: true,
  ntfyTopic: '',
  voiceAutoPlay: false,
  voiceModel: 'tts-1',
  voiceVoice: 'nova'
}

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

const SYNCED_KEYS = Object.keys(syncedDefaults) as (keyof SyncedSettings)[]

export function getSyncedSettings(): SyncedSettings {
  const path = syncConfigPath()
  if (!existsSync(path)) return { ...syncedDefaults }
  try {
    const raw = JSON.parse(readFileSync(path, 'utf-8'))
    // Only pick known synced keys — ignore stray keys like windowBounds
    const result = { ...syncedDefaults }
    for (const key of SYNCED_KEYS) {
      if (key in raw) (result as Record<string, unknown>)[key] = raw[key]
    }
    return result
  } catch {
    return { ...syncedDefaults }
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
