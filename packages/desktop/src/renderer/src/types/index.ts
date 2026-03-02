export type {
  Provider,
  Conversation,
  Message,
  ContentBlock,
  ImageAttachment,
  MCPServerConfig,
  LocalSettings,
  Reminder,
  Memory,
  SyncedSettings,
  Settings
} from '@april/core'

export type { SendMessagePayload, ChunkData } from '@april/core'
export type { MCPServerStatus } from '@april/core'

import type { Conversation, Message, Settings, Reminder } from '@april/core'
import type { SendMessagePayload, ChunkData } from '@april/core'
import type { MCPServerStatus } from '@april/core'

// Extend window for the API bridge
declare global {
  interface Window {
    api: {
      sendMessage: (payload: SendMessagePayload) => Promise<Message>
      generateTitle: (params: {
        provider: string
        model: string
        firstMessage: string
      }) => Promise<string>
      onChunk: (cb: (data: ChunkData) => void) => void
      offChunk: (cb: (data: ChunkData) => void) => void
      listConversations: () => Promise<Conversation[]>
      getConversation: (id: string) => Promise<Conversation | null>
      createConversation: () => Promise<Conversation>
      updateConversation: (conv: Conversation) => Promise<Conversation>
      deleteConversation: (id: string) => Promise<boolean>
      getSettings: () => Promise<Settings>
      setSettings: (s: Partial<Settings>) => Promise<Settings>
      listModels: (provider: string) => Promise<string[]>
      abortMessage: (conversationId: string) => void
      forwardChunk: (data: ChunkData) => void
      getMcpStatus: () => Promise<MCPServerStatus[]>
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
      transcribeAudio: (audioBuffer: ArrayBuffer) => Promise<string>
      synthesizeSpeech: (text: string) => Promise<ArrayBuffer>
    }
  }
}
