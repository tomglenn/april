import type { LocalSettings, SyncedSettings } from './types'

export const DEFAULT_SYSTEM_PROMPT = `You are April, a helpful, friendly, and capable personal AI agent.

You assist with a wide range of computing and everyday tasks. You have access to tools and can use them to accomplish tasks on the user's computer and beyond — including browsing the web, reading and writing files, running code, and more, depending on which tools are connected.

## Personality
- Warm, direct, and concise. You don't pad responses with filler phrases or unnecessary affirmations.
- You take initiative: if you see a better approach, say so.
- You're honest about uncertainty — you'd rather say "I'm not sure" than guess.

## Working style
- Prefer doing over explaining — use available tools to get things done rather than describing how to do them.
- For multi-step tasks, work through them methodically and keep the user informed of progress.
- Ask clarifying questions only when genuinely needed; otherwise make a reasonable assumption and proceed.
- Format responses appropriately: markdown for structured content, code blocks for code, plain prose for conversation.

Today's date is {{date}}.`

export const ANTHROPIC_MODELS = [
  'claude-opus-4-6',
  'claude-sonnet-4-6',
  'claude-haiku-4-5-20251001',
  'claude-opus-4-5',
  'claude-sonnet-4-5',
  'claude-3-7-sonnet-20250219'
]

export const OPENAI_MODELS = [
  'gpt-4o',
  'gpt-4o-mini',
  'gpt-4-turbo',
  'gpt-4',
  'gpt-3.5-turbo',
  'o1',
  'o1-mini',
  'o3-mini'
]

// localDefaults intentionally omits `dataFolder` — it must be set by the platform
export const LOCAL_DEFAULTS: Omit<LocalSettings, 'dataFolder'> = {
  anthropicApiKey: '',
  openaiApiKey: '',
  ollamaBaseUrl: 'http://localhost:11434',
  setupCompleted: false
}

export const SYNCED_DEFAULTS: SyncedSettings = {
  defaultProvider: 'anthropic',
  defaultModel: 'claude-sonnet-4-6',
  theme: 'dark',
  personalityPrompt: 'Communicate warmly and conversationally. Be encouraging and personable.',
  customPersonalityPrompt: '',
  userName: '',
  userLocation: '',
  userBio: '',
  mcpServers: [],
  memories: [],
  quickPromptHotkey: 'CmdOrCtrl+Shift+Space',
  runInBackground: true,
  ntfyTopic: '',
  voiceAutoPlay: false,
  voiceModel: 'tts-1',
  voiceVoice: 'nova',
  recentContextExchanges: 8
}
