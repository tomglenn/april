import { create } from 'zustand'
import type { Conversation, Message, Provider } from '@april/core'
import * as convStorage from '../platform/conversations'
import { deleteImageFile } from '../platform/imageStorage'
import AsyncStorage from '@react-native-async-storage/async-storage'

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

interface ConversationsState {
  conversations: Conversation[]
  activeId: string | null
  loading: boolean

  setConversations: (convs: Conversation[]) => void
  setActiveId: (id: string | null) => void
  addConversation: (conv: Conversation) => void
  updateConversation: (conv: Conversation) => void
  removeConversation: (id: string) => void
  addMessage: (conversationId: string, message: Message) => void
  updateMessageById: (conversationId: string, messageId: string, updater: (msg: Message) => Message) => void
  removeMessageById: (conversationId: string, messageId: string) => void
  setConversationModel: (id: string, model: string, provider: Provider) => void
  clearConversationModel: (id: string) => void

  load: () => Promise<void>
  createNew: () => Promise<Conversation>
  deleteConv: (id: string) => Promise<void>
  renameConv: (id: string, title: string) => Promise<void>
  persistConversation: (id: string) => Promise<void>
}

export const useConversationsStore = create<ConversationsState>((set, get) => ({
  conversations: [],
  activeId: null,
  loading: false,

  setConversations: (conversations) => set({ conversations }),
  setActiveId: (activeId) => {
    set({ activeId })
    if (activeId) {
      AsyncStorage.setItem('lastActiveConversationId', activeId).catch(() => {})
    } else {
      AsyncStorage.removeItem('lastActiveConversationId').catch(() => {})
    }
  },

  addConversation: (conv) =>
    set((state) => ({ conversations: [conv, ...state.conversations] })),

  updateConversation: (conv) =>
    set((state) => ({
      conversations: state.conversations.map((c) => (c.id === conv.id ? conv : c))
    })),

  removeConversation: (id) =>
    set((state) => ({
      conversations: state.conversations.filter((c) => c.id !== id),
      activeId: state.activeId === id ? null : state.activeId
    })),

  addMessage: (conversationId, message) => {
    set((state) => ({
      conversations: state.conversations.map((c) => {
        if (c.id !== conversationId) return c
        return { ...c, messages: [...c.messages, message], updatedAt: Date.now() }
      })
    }))
    // Skip persisting empty assistant placeholders
    if (message.role === 'assistant' && message.blocks.length === 0) return
    get().persistConversation(conversationId)
  },

  updateMessageById: (conversationId, messageId, updater) => {
    set((state) => ({
      conversations: state.conversations.map((c) => {
        if (c.id !== conversationId) return c
        return { ...c, messages: c.messages.map((m) => (m.id === messageId ? updater(m) : m)) }
      })
    }))
  },

  removeMessageById: (conversationId, messageId) => {
    set((state) => ({
      conversations: state.conversations.map((c) => {
        if (c.id !== conversationId) return c
        return { ...c, messages: c.messages.filter((m) => m.id !== messageId) }
      })
    }))
  },

  setConversationModel: (id, model, provider) => {
    set((state) => ({
      conversations: state.conversations.map((c) =>
        c.id === id ? { ...c, model, provider } : c
      )
    }))
    get().persistConversation(id)
  },

  clearConversationModel: (id) => {
    set((state) => ({
      conversations: state.conversations.map((c) =>
        c.id === id ? { ...c, model: undefined, provider: undefined } : c
      )
    }))
    get().persistConversation(id)
  },

  load: async () => {
    set({ loading: true })
    try {
      const convs = await convStorage.listConversations()
      const cleaned = convs.map((c) => ({
        ...c,
        messages: c.messages.filter((m) => !(m.role === 'assistant' && m.blocks.length === 0))
      }))
      let restoredActiveId: string | null = null
      try {
        const lastActiveId = await AsyncStorage.getItem('lastActiveConversationId')
        if (lastActiveId && cleaned.find((c) => c.id === lastActiveId)) {
          restoredActiveId = lastActiveId
        }
      } catch { /* ignore */ }
      set({ conversations: cleaned, activeId: restoredActiveId, loading: false })
    } catch {
      set({ loading: false })
    }
  },

  createNew: async () => {
    const conv: Conversation = {
      id: generateUUID(),
      title: 'New Chat',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: [],
      mcpServers: []
    }
    await convStorage.saveConversation(conv)
    get().addConversation(conv)
    get().setActiveId(conv.id)
    return conv
  },

  deleteConv: async (id) => {
    // Delete image files referenced by this conversation before removing it
    const conv = get().conversations.find((c) => c.id === id)
    if (conv) {
      for (const msg of conv.messages) {
        for (const block of msg.blocks) {
          if (block.type === 'image') {
            const img = block as { type: 'image'; fileUri?: string }
            if (img.fileUri) deleteImageFile(img.fileUri).catch(() => {})
          }
        }
      }
    }
    await convStorage.deleteConversation(id)
    get().removeConversation(id)
  },

  renameConv: async (id, title) => {
    const conv = get().conversations.find((c) => c.id === id)
    if (!conv) return
    const updated = { ...conv, title }
    await convStorage.saveConversation(updated)
    get().updateConversation(updated)
  },

  persistConversation: async (id) => {
    const conv = get().conversations.find((c) => c.id === id)
    if (conv) {
      await convStorage.saveConversation(conv).catch((err) => {
        console.warn('[conversations] Failed to persist:', err)
      })
    }
  }
}))
