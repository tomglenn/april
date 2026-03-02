import { useState, useEffect } from 'react'
import type { Provider } from '../types'

export interface ProviderGroup {
  provider: Provider
  label: string
  models: string[]
  loading: boolean
  failed: boolean
}

interface Input {
  anthropicApiKey: string
  openaiApiKey: string
  ollamaBaseUrl: string
}

interface Result {
  groups: ProviderGroup[]
  allEmpty: boolean
}

const PROVIDERS: { provider: Provider; label: string }[] = [
  { provider: 'anthropic', label: 'Anthropic' },
  { provider: 'openai', label: 'OpenAI' },
  { provider: 'ollama', label: 'Ollama' }
]

export function useMultiProviderModels({ anthropicApiKey, openaiApiKey, ollamaBaseUrl }: Input): Result {
  const [groups, setGroups] = useState<ProviderGroup[]>([])

  useEffect(() => {
    const configs = PROVIDERS.map(({ provider, label }) => {
      const hasCredential =
        provider === 'anthropic' ? !!anthropicApiKey.trim() :
        provider === 'openai' ? !!openaiApiKey.trim() :
        !!ollamaBaseUrl.trim()
      return { provider, label, hasCredential }
    })

    const active = configs.filter((c) => c.hasCredential)

    if (active.length === 0) {
      setGroups([])
      return
    }

    // Initialize groups as loading
    setGroups(active.map((c) => ({ provider: c.provider, label: c.label, models: [], loading: true, failed: false })))

    active.forEach((c) => {
      window.api
        .listModels(c.provider)
        .then((models) => {
          setGroups((prev) =>
            prev.map((g) =>
              g.provider === c.provider ? { ...g, models, loading: false, failed: models.length === 0 } : g
            )
          )
        })
        .catch(() => {
          setGroups((prev) =>
            prev.map((g) =>
              g.provider === c.provider ? { ...g, loading: false, failed: true } : g
            )
          )
        })
    })
  }, [anthropicApiKey, openaiApiKey, ollamaBaseUrl])

  const allEmpty = groups.length === 0 || groups.every((g) => !g.loading && (g.failed || g.models.length === 0))

  return { groups, allEmpty }
}
