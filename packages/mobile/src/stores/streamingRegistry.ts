/**
 * Lightweight counter tracking active streaming conversations.
 * Used to prevent loadConversations() from wiping in-memory placeholder
 * messages that haven't been persisted to disk yet.
 */
let _count = 0

export const streamingRegistry = {
  start: (): void => { _count++ },
  end: (): void => { _count = Math.max(0, _count - 1) },
  isActive: (): boolean => _count > 0
}
