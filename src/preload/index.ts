import { contextBridge, ipcRenderer } from 'electron'
import type { Conversation, Settings, Message } from '../renderer/src/types'
import type { SendMessagePayload, ChunkData } from '../main/ipc/chat'
import type { MCPServerStatus } from '../main/mcp'

// ipcRenderer.off requires the exact same function reference passed to ipcRenderer.on.
// We store the wrapper so onChunk/offChunk use the same reference.
type ChunkWrapper = Parameters<typeof ipcRenderer.on>[1]
const chunkListenerMap = new Map<(data: ChunkData) => void, ChunkWrapper>()

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
    ipcRenderer.invoke('providers:models', provider),

  // MCP
  getMcpStatus: (): Promise<MCPServerStatus[]> =>
    ipcRenderer.invoke('mcp:status')
}

contextBridge.exposeInMainWorld('api', api)

export type API = typeof api
