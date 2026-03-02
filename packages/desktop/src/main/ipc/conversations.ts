import { ipcMain } from 'electron'
import { v4 as uuidv4 } from 'uuid'
import {
  listConversations,
  getConversation,
  saveConversation,
  deleteConversation
} from '../store'
import type { Conversation } from '@april/core'

export function registerConversationHandlers(): void {
  ipcMain.handle('conversations:list', () => {
    return listConversations()
  })

  ipcMain.handle('conversations:get', (_, id: string) => {
    return getConversation(id)
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
    saveConversation(newConv)
    return newConv
  })

  ipcMain.handle('conversations:update', (_, conv: Conversation) => {
    const updated = { ...conv, updatedAt: Date.now() }
    saveConversation(updated)
    return updated
  })

  ipcMain.handle('conversations:delete', (_, id: string) => {
    deleteConversation(id)
    return true
  })
}
