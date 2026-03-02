import type { SyncedSettings, Reminder } from './types'

// ── Platform adapter interfaces ─────────────────────────────────────────────
// Minimal seam between core logic and platform-specific implementations.
// Desktop implements this with Electron APIs; future mobile provides its own.

export interface ChildProcessHandle {
  stdin: {
    write(data: string): void
    on(event: 'error', cb: (err: Error) => void): void
  } | null
  stdout: {
    setEncoding(enc: string): void
    on(event: 'data', cb: (chunk: string) => void): void
  } | null
  stderr: {
    setEncoding(enc: string): void
    on(event: 'data', cb: (chunk: string) => void): void
  } | null
  on(event: 'error', cb: (err: Error) => void): void
  on(event: 'exit', cb: (code: number | null) => void): void
  kill(): void
}

export interface SpawnOptions {
  env?: Record<string, string | undefined>
  cwd?: string
  stdio?: Array<'pipe' | 'ignore'>
  shell?: boolean
}

export interface StorageAdapter {
  readSyncedSettings(): SyncedSettings
  writeSyncedSettings(partial: Partial<SyncedSettings>): SyncedSettings
  getDataFolder(): string
  ensureDataFolderExists(): void
  readReminders(): Reminder[]
  writeReminders(reminders: Reminder[]): void
}

export interface NotificationAdapter {
  showNotification(title: string, body: string, onClick?: () => void): void
  broadcastEvent(channel: string, data?: unknown): void
}

export interface ProcessAdapter {
  spawn(command: string, args: string[], options: SpawnOptions): ChildProcessHandle
}

export interface PlatformAdapter {
  storage: StorageAdapter
  notifications: NotificationAdapter
  process: ProcessAdapter
}

// ── Singleton ────────────────────────────────────────────────────────────────

let _platform: PlatformAdapter | null = null

export function setPlatform(adapter: PlatformAdapter): void {
  _platform = adapter
}

export function getPlatform(): PlatformAdapter {
  if (!_platform) throw new Error('Platform adapter not initialized. Call setPlatform() at app startup.')
  return _platform
}
