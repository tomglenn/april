export type Provider = 'anthropic' | 'openai' | 'ollama'

export interface Conversation {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  messages: Message[]
  mcpServers: MCPServerConfig[]
}

export interface Message {
  id: string
  role: 'user' | 'assistant'
  blocks: ContentBlock[]
  model?: string
  provider?: Provider
  timestamp: number
  error?: string  // set on user messages when the API response failed
}

export type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'thinking'; thinking: string }
  | { type: 'tool_use'; id: string; name: string; input: unknown }
  | { type: 'tool_result'; tool_use_id: string; content: string }
  | { type: 'image'; mediaType: string; data: string }

export interface ImageAttachment {
  id: string
  dataUrl: string   // "data:image/jpeg;base64,..."
  mediaType: string // always 'image/jpeg' — canvas normalises to JPEG
}

export interface MCPServerConfig {
  name: string
  command: string
  args: string[]
  env?: Record<string, string>
  enabled: boolean
}

// Settings stored locally (never synced — API keys, window bounds, etc.)
export interface LocalSettings {
  anthropicApiKey: string
  openaiApiKey: string
  ollamaBaseUrl: string
  setupCompleted: boolean
  dataFolder: string // path to the synced data folder
  windowBounds?: { x: number; y: number; width: number; height: number }
}

export interface Reminder {
  id: string
  message: string
  fireAt: number
  createdAt: number
}

// Settings stored in {dataFolder}/config.json (synced across devices)
export interface SyncedSettings {
  defaultProvider: Provider
  defaultModel: string
  theme: 'dark' | 'light' | 'system'
  systemPrompt: string
  userName: string
  userLocation: string
  userBio: string
  mcpServers: MCPServerConfig[]
  quickPromptHotkey: string
  runInBackground: boolean
  ntfyTopic: string
}

// Combined view for the renderer — it doesn't need to know about the split
export interface Settings extends LocalSettings, SyncedSettings {}

// Extend window for the API bridge
declare global {
  interface Window {
    api: {
      sendMessage: (payload: import('../../../main/ipc/chat').SendMessagePayload) => Promise<Message>
      generateTitle: (params: {
        provider: string
        model: string
        firstMessage: string
      }) => Promise<string>
      onChunk: (cb: (data: import('../../../main/ipc/chat').ChunkData) => void) => void
      offChunk: (cb: (data: import('../../../main/ipc/chat').ChunkData) => void) => void
      listConversations: () => Promise<Conversation[]>
      getConversation: (id: string) => Promise<Conversation | null>
      createConversation: () => Promise<Conversation>
      updateConversation: (conv: Conversation) => Promise<Conversation>
      deleteConversation: (id: string) => Promise<boolean>
      getSettings: () => Promise<Settings>
      setSettings: (s: Partial<Settings>) => Promise<Settings>
      listModels: (provider: string) => Promise<string[]>
      abortMessage: (conversationId: string) => void
      forwardChunk: (data: import('../../../main/ipc/chat').ChunkData) => void
      getMcpStatus: () => Promise<import('../../../main/mcp').MCPServerStatus[]>
      getDataFolder: () => Promise<string>
      pickDataFolder: () => Promise<string | null>
      onSyncChanged: (cb: () => void) => void
      offSyncChanged: (cb: () => void) => void
      notifyHotkeyChanged: () => void
      notifyBackgroundChanged: () => void
      openInApp: (conversationId: string) => void
      onOpenConversation: (cb: (id: string) => void) => void
      offOpenConversation: (cb: (id: string) => void) => void
      listReminders: () => Promise<Reminder[]>
      cancelReminder: (id: string) => Promise<boolean>
      onRemindersChanged: (cb: () => void) => void
      offRemindersChanged: (cb: () => void) => void
    }
  }
}
