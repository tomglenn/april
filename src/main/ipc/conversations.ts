import { ipcMain } from 'electron'
import { v4 as uuidv4 } from 'uuid'
import { store } from '../store'
import type { Conversation } from '../../renderer/src/types'

export function registerConversationHandlers(): void {
  ipcMain.handle('conversations:list', () => {
    return store.get('conversations') as Conversation[]
  })

  ipcMain.handle('conversations:get', (_, id: string) => {
    const conversations = store.get('conversations') as Conversation[]
    return conversations.find((c) => c.id === id) ?? null
  })

  ipcMain.handle('conversations:create', () => {
    const newConv: Conversation = {
      id: uuidv4(),
      title: 'New Chat',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: [],
      mcpServers: []
    }
    const conversations = store.get('conversations') as Conversation[]
    store.set('conversations', [newConv, ...conversations])
    return newConv
  })

  ipcMain.handle('conversations:update', (_, conv: Conversation) => {
    const conversations = store.get('conversations') as Conversation[]
    const idx = conversations.findIndex((c) => c.id === conv.id)
    if (idx === -1) return null
    conversations[idx] = { ...conv, updatedAt: Date.now() }
    store.set('conversations', conversations)
    return conversations[idx]
  })

  ipcMain.handle('conversations:delete', (_, id: string) => {
    const conversations = store.get('conversations') as Conversation[]
    store.set(
      'conversations',
      conversations.filter((c) => c.id !== id)
    )
    return true
  })
}
