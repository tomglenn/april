import { File, Directory } from 'expo-file-system'
import { getConvDir } from './storage'
import type { Conversation } from '@april/core'

function convFile(id: string): File {
  return new File(getConvDir(), `${id}.json`)
}

export async function listConversations(): Promise<Conversation[]> {
  try {
    const dir = getConvDir()
    if (!dir.exists) return []

    const entries = dir.list()
    const convs: Conversation[] = []

    for (const entry of entries) {
      if (entry instanceof File && entry.uri.endsWith('.json')) {
        try {
          const raw = await entry.text()
          convs.push(JSON.parse(raw))
        } catch {
          // skip corrupt files
        }
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
    const file = convFile(id)
    if (!file.exists) return null
    const raw = await file.text()
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export async function saveConversation(conv: Conversation): Promise<void> {
  const file = convFile(conv.id)
  file.write(JSON.stringify(conv, null, 2))
}

export async function deleteConversation(id: string): Promise<void> {
  try {
    const file = convFile(id)
    if (file.exists) {
      file.delete()
    }
  } catch {
    // ignore
  }
}
