import { spawn } from 'child_process'
import { join } from 'path'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { Notification, BrowserWindow } from 'electron'
import { getDataFolder, ensureDataFolderExists, getSyncedSettings, setSyncedSettings, markOwnWrite } from './store'
import type { PlatformAdapter, StorageAdapter, NotificationAdapter, ProcessAdapter, ChildProcessHandle, SpawnOptions } from '@april/core'
import type { SyncedSettings, Reminder } from '@april/core'

// ── Storage ──────────────────────────────────────────────────────────────────

const storage: StorageAdapter = {
  readSyncedSettings(): SyncedSettings {
    return getSyncedSettings()
  },

  writeSyncedSettings(partial: Partial<SyncedSettings>): SyncedSettings {
    return setSyncedSettings(partial)
  },

  getDataFolder(): string {
    return getDataFolder()
  },

  ensureDataFolderExists(): void {
    ensureDataFolderExists()
  },

  readReminders(): Reminder[] {
    const p = join(getDataFolder(), 'reminders.json')
    if (!existsSync(p)) return []
    try {
      return JSON.parse(readFileSync(p, 'utf-8'))
    } catch {
      return []
    }
  },

  writeReminders(reminders: Reminder[]): void {
    markOwnWrite()
    writeFileSync(join(getDataFolder(), 'reminders.json'), JSON.stringify(reminders, null, 2), 'utf-8')
  }
}

// ── Notifications ────────────────────────────────────────────────────────────

const notifications: NotificationAdapter = {
  showNotification(title: string, body: string, onClick?: () => void): void {
    const notification = new Notification({ title, body })
    if (onClick) {
      notification.on('click', onClick)
    } else {
      notification.on('click', () => {
        const wins = BrowserWindow.getAllWindows()
        const mainWin = wins.find((w) => !w.isDestroyed())
        if (mainWin) {
          mainWin.show()
          mainWin.focus()
        }
      })
    }
    notification.show()
  },

  broadcastEvent(channel: string, data?: unknown): void {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        if (data !== undefined) {
          win.webContents.send(channel, data)
        } else {
          win.webContents.send(channel)
        }
      }
    }
  }
}

// ── Process ──────────────────────────────────────────────────────────────────

const processAdapter: ProcessAdapter = {
  spawn(command: string, args: string[], options: SpawnOptions): ChildProcessHandle {
    return spawn(command, args, {
      env: { ...process.env, ...options.env },
      cwd: options.cwd,
      stdio: (options.stdio ?? ['pipe', 'pipe', 'pipe']) as Array<'pipe' | 'ignore'>,
      shell: options.shell ?? false
    }) as unknown as ChildProcessHandle
  }
}

// ── Adapter ──────────────────────────────────────────────────────────────────

export const electronPlatform: PlatformAdapter = {
  storage,
  notifications,
  process: processAdapter
}
