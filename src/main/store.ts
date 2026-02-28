import Store from 'electron-store'
import { app } from 'electron'
import { join } from 'path'
import type { Conversation, Settings } from '../renderer/src/types'

export interface AppStore {
  conversations: Conversation[]
  settings: Settings
  windowBounds?: { x: number; y: number; width: number; height: number }
}

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

const defaults: AppStore = {
  conversations: [],
  settings: {
    anthropicApiKey: '',
    openaiApiKey: '',
    ollamaBaseUrl: 'http://localhost:11434',
    defaultProvider: 'anthropic',
    defaultModel: 'claude-sonnet-4-6',
    theme: 'dark',
    systemPrompt: DEFAULT_SYSTEM_PROMPT
  }
}

// Pin the store to a fixed path so it never moves if app.setName() or
// productName changes the value returned by app.getPath('userData').
export const store = new Store<AppStore>({
  defaults,
  cwd: join(app.getPath('appData'), 'april-agent')
})
