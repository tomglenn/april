import { create } from 'zustand'
import type { Conversation, Message } from '../types'

interface ConversationsState {
  conversations: Conversation[]
  activeId: string | null
  loading: boolean

  // Actions
  setConversations: (convs: Conversation[]) => void
  setActiveId: (id: string | null) => void
  addConversation: (conv: Conversation) => void
  updateConversation: (conv: Conversation) => void
  removeConversation: (id: string) => void
  addMessage: (conversationId: string, message: Message) => void
  updateLastMessage: (conversationId: string, updater: (msg: Message) => Message) => void
  updateMessageById: (conversationId: string, messageId: string, updater: (msg: Message) => Message) => void
  removeMessageById: (conversationId: string, messageId: string) => void

  // Async actions
  load: () => Promise<void>
  createNew: () => Promise<Conversation>
  deleteConv: (id: string) => Promise<void>
  renameConv: (id: string, title: string) => Promise<void>
}

export const useConversationsStore = create<ConversationsState>((set, get) => ({
  conversations: [],
  activeId: null,
  loading: false,

  setConversations: (conversations) => set({ conversations }),
  setActiveId: (activeId) => {
    set({ activeId })
    if (activeId) localStorage.setItem('lastActiveConversationId', activeId)
    else localStorage.removeItem('lastActiveConversationId')
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
    // Persist outside the updater — never call IPC inside a set() updater
    const updated = get().conversations.find((c) => c.id === conversationId)
    if (updated) window.api.updateConversation(updated)
  },

  updateLastMessage: (conversationId, updater) => {
    set((state) => ({
      conversations: state.conversations.map((c) => {
        if (c.id !== conversationId) return c
        const messages = [...c.messages]
        const lastIdx = messages.length - 1
        if (lastIdx < 0) return c
        messages[lastIdx] = updater(messages[lastIdx])
        return { ...c, messages }
      })
    }))
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

  load: async () => {
    set({ loading: true })
    try {
      const convs = await window.api.listConversations()
      // Strip empty assistant placeholders orphaned by failed/interrupted requests
      const cleaned = convs.map((c) => ({
        ...c,
        messages: c.messages.filter((m) => !(m.role === 'assistant' && m.blocks.length === 0))
      }))
      // Restore last active conversation if it still exists
      const lastActiveId = localStorage.getItem('lastActiveConversationId')
      const restoredActiveId = lastActiveId && cleaned.find((c) => c.id === lastActiveId)
        ? lastActiveId
        : null
      set({ conversations: cleaned, activeId: restoredActiveId, loading: false })
    } catch {
      set({ loading: false })
    }
  },

  createNew: async () => {
    const conv = await window.api.createConversation()
    get().addConversation(conv)
    set({ activeId: conv.id })
    return conv
  },

  deleteConv: async (id) => {
    await window.api.deleteConversation(id)
    get().removeConversation(id)
  },

  renameConv: async (id, title) => {
    // Read the latest state, update title, and persist.
    // Re-read after await to avoid overwriting messages added during the IPC call.
    const conv = get().conversations.find((c) => c.id === id)
    if (!conv) return
    await window.api.updateConversation({ ...conv, title })
    const fresh = get().conversations.find((c) => c.id === id)
    if (fresh) get().updateConversation({ ...fresh, title })
  }
}))
