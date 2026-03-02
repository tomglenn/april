import { randomUUID } from 'crypto'
import { getPlatform } from './platform'
import type { Reminder } from './types'

const timers = new Map<string, ReturnType<typeof setTimeout>>()
let reminders: Reminder[] = []

function persist(): void {
  getPlatform().storage.writeReminders(reminders)
}

function load(): Reminder[] {
  return getPlatform().storage.readReminders()
}

function broadcastChange(): void {
  getPlatform().notifications.broadcastEvent('reminders:changed')
}

function fireReminder(id: string): void {
  const r = reminders.find((rem) => rem.id === id)
  if (!r) return

  timers.delete(id)

  const platform = getPlatform()
  platform.notifications.showNotification('April', r.message)

  // Send to ntfy.sh if configured
  const ntfyTopic = platform.storage.readSyncedSettings().ntfyTopic
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

export function addReminder(message: string, delayMinutes: number): Reminder {
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
