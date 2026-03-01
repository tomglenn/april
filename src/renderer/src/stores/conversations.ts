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
    // Skip persisting empty assistant placeholders — they only exist in memory
    // during streaming and would be stripped by onSyncChanged, creating a race.
    if (message.role === 'assistant' && message.blocks.length === 0) return
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
    get().setActiveId(conv.id)
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

// Listen for external sync changes (e.g. iCloud/Dropbox updated a file).
// Merge disk state with in-memory state so we never clobber conversations
// that have unsaved local changes (e.g. mid-stream assistant messages).
if (typeof window !== 'undefined' && window.api?.onSyncChanged) {
  window.api.onSyncChanged(async () => {
    const { activeId, conversations: local } = useConversationsStore.getState()
    try {
      const disk = await window.api.listConversations()
      const diskMap = new Map(disk.map((c) => [c.id, c]))
      const localMap = new Map(local.map((c) => [c.id, c]))

      // Merge: for each conversation, keep whichever version has more
      // messages (local may have messages not yet persisted to disk).
      const mergedIds = new Set([...diskMap.keys(), ...localMap.keys()])
      const merged: typeof local = []
      for (const id of mergedIds) {
        const d = diskMap.get(id)
        const l = localMap.get(id)
        if (l && (!d || l.messages.length >= d.messages.length)) {
          merged.push(l)
        } else if (d) {
          merged.push({
            ...d,
            messages: d.messages.filter((m) => !(m.role === 'assistant' && m.blocks.length === 0))
          })
        }
      }
      merged.sort((a, b) => b.updatedAt - a.updatedAt)

      const stillExists = activeId && merged.find((c) => c.id === activeId)
      useConversationsStore.setState({
        conversations: merged,
        activeId: stillExists ? activeId : null
      })
    } catch {
      // ignore
    }
  })
}
