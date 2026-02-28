import { contextBridge, ipcRenderer } from 'electron'
import type { Conversation, Settings, Message } from '../renderer/src/types'
import type { SendMessagePayload, ChunkData } from '../main/ipc/chat'

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
    ipcRenderer.on('chat:chunk', (_, data) => cb(data))
  },
  offChunk: (cb: (data: ChunkData) => void): void => {
    ipcRenderer.off('chat:chunk', (_, data) => cb(data))
  },

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

  // Providers
  listModels: (provider: string): Promise<string[]> =>
    ipcRenderer.invoke('providers:models', provider)
}

contextBridge.exposeInMainWorld('api', api)

export type API = typeof api
