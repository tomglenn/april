import type { NotificationAdapter } from '@april/core'

type Listener = (data?: unknown) => void
const listeners = new Map<string, Set<Listener>>()

export const notifications: NotificationAdapter = {
  showNotification(_title: string, _body: string, _onClick?: () => void): void {
    // No-op on mobile for now — could use expo-notifications later
  },

  broadcastEvent(channel: string, data?: unknown): void {
    const set = listeners.get(channel)
    if (set) {
      for (const fn of set) fn(data)
    }
  }
}

export function onEvent(channel: string, fn: Listener): () => void {
  if (!listeners.has(channel)) listeners.set(channel, new Set())
  listeners.get(channel)!.add(fn)
  return () => {
    listeners.get(channel)?.delete(fn)
  }
}
