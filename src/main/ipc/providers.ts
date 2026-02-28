import { ipcMain } from 'electron'
import { store } from '../store'
import type { Provider, Settings } from '../../renderer/src/types'

const ANTHROPIC_MODELS = [
  'claude-opus-4-6',
  'claude-sonnet-4-6',
  'claude-haiku-4-5-20251001',
  'claude-opus-4-5',
  'claude-sonnet-4-5',
  'claude-3-7-sonnet-20250219'
]

const OPENAI_MODELS = [
  'gpt-4o',
  'gpt-4o-mini',
  'gpt-4-turbo',
  'gpt-4',
  'gpt-3.5-turbo',
  'o1',
  'o1-mini',
  'o3-mini'
]

export function registerProviderHandlers(): void {
  ipcMain.handle('providers:models', async (_, provider: Provider) => {
    if (provider === 'anthropic') {
      return ANTHROPIC_MODELS
    }

    if (provider === 'openai') {
      return OPENAI_MODELS
    }

    if (provider === 'ollama') {
      const settings = store.get('settings') as Settings
      const baseUrl = settings.ollamaBaseUrl || 'http://localhost:11434'
      try {
        const res = await fetch(`${baseUrl}/api/tags`)
        if (!res.ok) return []
        const data = (await res.json()) as { models: Array<{ name: string }> }
        return data.models.map((m) => m.name)
      } catch {
        return []
      }
    }

    return []
  })
}
