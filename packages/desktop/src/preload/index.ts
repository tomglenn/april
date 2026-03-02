import { contextBridge, ipcRenderer } from 'electron'
import type { Conversation, Settings, Message, Reminder, SendMessagePayload, ChunkData, MCPServerStatus } from '@april/core'

// ipcRenderer.off requires the exact same function reference passed to ipcRenderer.on.
// We store the wrapper so onChunk/offChunk use the same reference.
type ChunkWrapper = Parameters<typeof ipcRenderer.on>[1]
const chunkListenerMap = new Map<(data: ChunkData) => void, ChunkWrapper>()
const syncListenerMap = new Map<() => void, ChunkWrapper>()
const openConvListenerMap = new Map<(id: string) => void, ChunkWrapper>()
const remindersListenerMap = new Map<() => void, ChunkWrapper>()

const api = {
  // Chat
  sendMessage: (payload: SendMessagePayload): Promise<Message> =>
    ipcRenderer.invoke('chat:send', payload),
  generateTitle: (params: {
    provider: string
    model: string
    firstMessage: string
  }): Promise<string> => ipcRenderer.invoke('chat:title', params),
  onChunk: (cb: (data: ChunkData) => void): void => {
    const wrapper: ChunkWrapper = (_, data) => cb(data as ChunkData)
    chunkListenerMap.set(cb, wrapper)
    ipcRenderer.on('chat:chunk', wrapper)
  },
  offChunk: (cb: (data: ChunkData) => void): void => {
    const wrapper = chunkListenerMap.get(cb)
    if (wrapper) {
      ipcRenderer.off('chat:chunk', wrapper)
      chunkListenerMap.delete(cb)
    }
  },
  abortMessage: (conversationId: string): void =>
    ipcRenderer.send('chat:abort', conversationId),
  forwardChunk: (data: ChunkData): void =>
    ipcRenderer.send('overlay:forwardChunk', data),

  // Conversations
  listConversations: (): Promise<Conversation[]> =>
    ipcRenderer.invoke('conversations:list'),
  getConversation: (id: string): Promise<Conversation | null> =>
    ipcRenderer.invoke('conversations:get', id),
  createConversation: (): Promise<Conversation> =>
    ipcRenderer.invoke('conversations:create'),
  updateConversation: (conv: Conversation): Promise<Conversation> =>
    ipcRenderer.invoke('conversations:update', conv),
  deleteConversation: (id: string): Promise<boolean> =>
    ipcRenderer.invoke('conversations:delete', id),

  // Settings
  getSettings: (): Promise<Settings> => ipcRenderer.invoke('settings:get'),
  setSettings: (s: Partial<Settings>): Promise<Settings> =>
    ipcRenderer.invoke('settings:set', s),

  // Data folder
  getDataFolder: (): Promise<string> => ipcRenderer.invoke('settings:getDataFolder'),
  pickDataFolder: (): Promise<string | null> => ipcRenderer.invoke('settings:pickDataFolder'),

  // Sync events
  onSyncChanged: (cb: () => void): void => {
    const wrapper: ChunkWrapper = () => cb()
    syncListenerMap.set(cb, wrapper)
    ipcRenderer.on('sync:changed', wrapper)
  },
  offSyncChanged: (cb: () => void): void => {
    const wrapper = syncListenerMap.get(cb)
    if (wrapper) {
      ipcRenderer.off('sync:changed', wrapper)
      syncListenerMap.delete(cb)
    }
  },

  // Providers
  listModels: (provider: string): Promise<string[]> =>
    ipcRenderer.invoke('providers:models', provider),

  // MCP
  getMcpStatus: (): Promise<MCPServerStatus[]> =>
    ipcRenderer.invoke('mcp:status'),

  // Quick Prompt
  notifyHotkeyChanged: (): void => ipcRenderer.send('settings:hotkeyChanged'),
  notifyBackgroundChanged: (): void => ipcRenderer.send('settings:backgroundChanged'),
  openInApp: (conversationId: string): void =>
    ipcRenderer.send('overlay:openInApp', conversationId),
  onOpenConversation: (cb: (id: string) => void): void => {
    const wrapper: ChunkWrapper = (_, id) => cb(id as string)
    openConvListenerMap.set(cb, wrapper)
    ipcRenderer.on('open-conversation', wrapper)
  },
  offOpenConversation: (cb: (id: string) => void): void => {
    const wrapper = openConvListenerMap.get(cb)
    if (wrapper) {
      ipcRenderer.off('open-conversation', wrapper)
      openConvListenerMap.delete(cb)
    }
  },

  // Reminders
  listReminders: (): Promise<Reminder[]> =>
    ipcRenderer.invoke('reminders:list'),
  cancelReminder: (id: string): Promise<boolean> =>
    ipcRenderer.invoke('reminders:cancel', id),
  onRemindersChanged: (cb: () => void): void => {
    const wrapper: ChunkWrapper = () => cb()
    remindersListenerMap.set(cb, wrapper)
    ipcRenderer.on('reminders:changed', wrapper)
  },
  offRemindersChanged: (cb: () => void): void => {
    const wrapper = remindersListenerMap.get(cb)
    if (wrapper) {
      ipcRenderer.off('reminders:changed', wrapper)
      remindersListenerMap.delete(cb)
    }
  },

  // Voice
  transcribeAudio: (audioBuffer: ArrayBuffer): Promise<string> =>
    ipcRenderer.invoke('voice:transcribe', audioBuffer),
  synthesizeSpeech: (text: string): Promise<ArrayBuffer> =>
    ipcRenderer.invoke('voice:synthesize', text)
}

contextBridge.exposeInMainWorld('api', api)

export type API = typeof api
