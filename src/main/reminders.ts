import { join } from 'path'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { randomUUID } from 'crypto'
import { Notification, BrowserWindow } from 'electron'
import { getDataFolder, getSyncedSettings, markOwnWrite } from './store'

export interface Reminder {
  id: string
  message: string
  fireAt: number
  createdAt: number
}

const timers = new Map<string, ReturnType<typeof setTimeout>>()
let reminders: Reminder[] = []

function remindersPath(): string {
  return join(getDataFolder(), 'reminders.json')
}

function persist(): void {
  markOwnWrite()
  writeFileSync(remindersPath(), JSON.stringify(reminders, null, 2), 'utf-8')
}

function load(): Reminder[] {
  const p = remindersPath()
  if (!existsSync(p)) return []
  try {
    return JSON.parse(readFileSync(p, 'utf-8'))
  } catch {
    return []
  }
}

function broadcastChange(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send('reminders:changed')
    }
  }
}

function fireReminder(id: string): void {
  const r = reminders.find((rem) => rem.id === id)
  if (!r) return

  timers.delete(id)

  const notification = new Notification({
    title: 'April',
    body: r.message
  })
  notification.on('click', () => {
    const wins = BrowserWindow.getAllWindows()
    const mainWin = wins.find((w) => !w.isDestroyed())
    if (mainWin) {
      mainWin.show()
      mainWin.focus()
    }
  })
  notification.show()

  // Send to ntfy.sh if configured
  const ntfyTopic = getSyncedSettings().ntfyTopic
  if (ntfyTopic) {
    fetch(`https://ntfy.sh/${encodeURIComponent(ntfyTopic)}`, {
      method: 'POST',
      headers: { Title: 'April' },
      body: r.message
    }).catch(() => {})
  }

  // Remove from store
  reminders = reminders.filter((rem) => rem.id !== id)
  persist()
  broadcastChange()
}

function scheduleOne(r: Reminder): void {
  const delay = r.fireAt - Date.now()
  if (delay <= 0) {
    // Past due within 24h — fire immediately
    fireReminder(r.id)
    return
  }
  const timer = setTimeout(() => fireReminder(r.id), delay)
  timers.set(r.id, timer)
}

export function loadAndScheduleReminders(): void {
  reminders = load()
  const now = Date.now()
  const twentyFourHoursAgo = now - 24 * 60 * 60 * 1000

  // Discard reminders older than 24h past due
  reminders = reminders.filter((r) => r.fireAt > twentyFourHoursAgo)
  persist()

  for (const r of reminders) {
    scheduleOne(r)
  }
}

function ensureNotificationPermission(): void {
  if (Notification.isSupported() && process.platform === 'darwin') {
    // Trigger the macOS permission prompt by showing and immediately closing a silent notification.
    // Subsequent notifications will work without the user missing the first one.
    const probe = new Notification({ title: 'April', body: 'Reminders enabled', silent: true })
    probe.show()
    probe.close()
  }
}

let permissionRequested = false

export function addReminder(message: string, delayMinutes: number): Reminder {
  if (!permissionRequested) {
    permissionRequested = true
    ensureNotificationPermission()
  }

  const r: Reminder = {
    id: randomUUID(),
    message,
    fireAt: Date.now() + delayMinutes * 60000,
    createdAt: Date.now()
  }
  reminders.push(r)
  persist()
  scheduleOne(r)
  broadcastChange()
  return r
}

export function cancelReminder(id: string): boolean {
  const timer = timers.get(id)
  if (timer) {
    clearTimeout(timer)
    timers.delete(id)
  }
  const before = reminders.length
  reminders = reminders.filter((r) => r.id !== id)
  if (reminders.length < before) {
    persist()
    broadcastChange()
    return true
  }
  return false
}

export function getReminders(): Reminder[] {
  return [...reminders].sort((a, b) => a.fireAt - b.fireAt)
}
