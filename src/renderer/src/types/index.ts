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
}

export type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'thinking'; thinking: string }
  | { type: 'tool_use'; id: string; name: string; input: unknown }
  | { type: 'tool_result'; tool_use_id: string; content: string }

export interface MCPServerConfig {
  name: string
  command: string
  args: string[]
  env?: Record<string, string>
  enabled: boolean
}

export interface Settings {
  anthropicApiKey: string
  openaiApiKey: string
  ollamaBaseUrl: string
  defaultProvider: Provider
  defaultModel: string
  theme: 'dark' | 'light' | 'system'
  systemPrompt: string
}

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
    }
  }
}
