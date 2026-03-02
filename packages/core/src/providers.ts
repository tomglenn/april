import { ANTHROPIC_MODELS, OPENAI_MODELS } from './constants'
import type { Provider } from './types'

export async function fetchModels(provider: Provider, ollamaBaseUrl?: string): Promise<string[]> {
  if (provider === 'anthropic') {
    return ANTHROPIC_MODELS
  }

  if (provider === 'openai') {
    return OPENAI_MODELS
  }

  if (provider === 'ollama') {
    const baseUrl = ollamaBaseUrl || 'http://localhost:11434'
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
}
