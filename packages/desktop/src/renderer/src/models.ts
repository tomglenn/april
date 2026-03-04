import type { Provider } from './types'

export interface ModelDef {
  id: string
  label: string
  model: string
  provider: Provider
}

export const MODEL_CATALOG: ModelDef[] = [
  { id: 'anthropic-opus',   label: 'Claude Opus 4.6',   model: 'claude-opus-4-6',           provider: 'anthropic' },
  { id: 'anthropic-sonnet', label: 'Claude Sonnet 4.6', model: 'claude-sonnet-4-6',          provider: 'anthropic' },
  { id: 'anthropic-haiku',  label: 'Claude Haiku 4.5',  model: 'claude-haiku-4-5-20251001',  provider: 'anthropic' },
  { id: 'openai-gpt4o',     label: 'GPT-4o',            model: 'gpt-4o',                     provider: 'openai'    },
  { id: 'openai-gpt4o-mini',label: 'GPT-4o mini',       model: 'gpt-4o-mini',                provider: 'openai'    },
]
