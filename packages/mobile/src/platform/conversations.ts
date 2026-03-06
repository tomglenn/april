import { getConvDir } from './storage'
import { FolderPickerModule } from '../../modules/folder-picker'
import type { Conversation } from '@april/core'

function convFileUri(id: string): string {
  return getConvDir() + id + '.json'
}

export async function listConversations(): Promise<Conversation[]> {
  try {
    const files = await FolderPickerModule.listJsonFiles(getConvDir())
    const convs: Conversation[] = []
    for (const uri of files) {
      try {
        const raw = await FolderPickerModule.readFile(uri)
        if (raw) convs.push(JSON.parse(raw))
      } catch {
        // skip corrupt files
      }
    }
    convs.sort((a, b) => b.updatedAt - a.updatedAt)
    return convs
  } catch {
    return []
  }
}

export async function getConversation(id: string): Promise<Conversation | null> {
  try {
    const raw = await FolderPickerModule.readFile(convFileUri(id))
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export async function saveConversation(conv: Conversation): Promise<void> {
  await FolderPickerModule.writeFile(convFileUri(conv.id), JSON.stringify(conv, null, 2))
}

export async function deleteConversation(id: string): Promise<void> {
  await FolderPickerModule.deleteFile(convFileUri(id))
}
