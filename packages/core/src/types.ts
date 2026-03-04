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

export interface Memory {
  id: string
  content: string
  createdAt: number
}

// Settings stored in {dataFolder}/config.json (synced across devices)
export interface SyncedSettings {
  defaultProvider: Provider
  defaultModel: string
  theme: 'dark' | 'light' | 'system'
  personalityPrompt: string
  customPersonalityPrompt: string
  userName: string
  userLocation: string
  userBio: string
  mcpServers: MCPServerConfig[]
  memories: Memory[]
  quickPromptHotkey: string
  quickSwitcherHotkey: string
  runInBackground: boolean
  ntfyTopic: string
  voiceAutoPlay: boolean
  voiceModel: string
  voiceVoice: string
  recentContextExchanges: number
}

// Combined view for the renderer — it doesn't need to know about the split
export interface Settings extends LocalSettings, SyncedSettings {}
