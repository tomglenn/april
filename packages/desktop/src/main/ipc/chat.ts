import { ipcMain } from 'electron'
import { setMaxListeners } from 'events'
import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import { getSettings } from '../store'
import {
  buildSystemPrompt,
  messagesToAnthropicFormat,
  messagesToOpenAIFormat,
  runAnthropicLoop,
  runOpenAILoop,
  getAvailableTools
} from '@april/core'
import type { SendMessagePayload, ChunkData, Message } from '@april/core'

export type { SendMessagePayload, ChunkData }

// ── Abort registry ────────────────────────────────────────────────────────────

const abortControllers = new Map<string, AbortController>()

// ── IPC registration ──────────────────────────────────────────────────────────

export function registerChatHandlers(): void {
  ipcMain.handle('chat:send', async (event, payload: SendMessagePayload) => {
    const settings = getSettings()
    const sender = event.sender
    const systemPrompt = buildSystemPrompt(settings)

    const controller = new AbortController()
    setMaxListeners(0, controller.signal)
    abortControllers.set(payload.conversationId, controller)

    const sendChunk = (data: ChunkData): void => {
      if (!sender.isDestroyed()) sender.send('chat:chunk', { ...data, conversationId: payload.conversationId })
    }

    let finalMsg: Message | null = null

    try {
      const availableTools = getAvailableTools(settings)

      if (payload.provider === 'anthropic') {
        const anthropic = new Anthropic({ apiKey: settings.anthropicApiKey })
        const anthropicMessages = messagesToAnthropicFormat(payload.messages)

        // Mark system prompt and tools for prompt caching
        const cachedSystem = systemPrompt
          ? [{ type: 'text' as const, text: systemPrompt, cache_control: { type: 'ephemeral' as const } }]
          : undefined
        const cachedTools = availableTools.map((t, i) =>
          i === availableTools.length - 1
            ? { ...t, cache_control: { type: 'ephemeral' as const } }
            : t
        )

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const baseParams: any = {
          model: payload.model,
          max_tokens: payload.enableThinking ? 16000 : 8096,
          system: cachedSystem,
          tools: cachedTools,
          messages: anthropicMessages
        }

        if (payload.enableThinking) {
          baseParams.thinking = { type: 'enabled', budget_tokens: 10000 }
          baseParams.betas = ['thinking-2025-01-15']
        }

        finalMsg = await runAnthropicLoop(anthropic, baseParams, sendChunk, controller.signal, settings.openaiApiKey)
      } else if (payload.provider === 'openai' || payload.provider === 'ollama') {
        const openai = new OpenAI({
          apiKey: payload.provider === 'openai' ? settings.openaiApiKey : 'ollama',
          baseURL: payload.provider === 'ollama' ? `${settings.ollamaBaseUrl}/v1` : undefined
        })

        const openaiMessages: OpenAI.ChatCompletionMessageParam[] = [
          ...(systemPrompt ? [{ role: 'system' as const, content: systemPrompt }] : []),
          ...messagesToOpenAIFormat(payload.messages)
        ]

        finalMsg = await runOpenAILoop(openai, payload.model, openaiMessages, sendChunk, controller.signal, payload.provider === 'openai' ? availableTools : [], settings.openaiApiKey)
        if (finalMsg) finalMsg.provider = payload.provider
      }
    } catch (err) {
      if (!controller.signal.aborted) {
        const error = err instanceof Error ? err.message : String(err)
        sendChunk({ type: 'error', error })
      }
    } finally {
      abortControllers.delete(payload.conversationId)
      if (controller.signal.aborted) {
        sendChunk({ type: 'aborted', finalMessage: finalMsg ?? undefined })
      } else {
        sendChunk({ type: 'done', finalMessage: finalMsg ?? undefined })
      }
    }

    return finalMsg
  })

  ipcMain.on('chat:abort', (_, conversationId: string) => {
    abortControllers.get(conversationId)?.abort()
  })

  ipcMain.handle(
    'chat:title',
    async (_, { provider, model, firstMessage }: { provider: string; model: string; firstMessage: string }) => {
      const settings = getSettings()
      try {
        if (provider === 'anthropic') {
          const anthropic = new Anthropic({ apiKey: settings.anthropicApiKey })
          const response = await anthropic.messages.create({
            model,
            max_tokens: 30,
            messages: [
              {
                role: 'user',
                content: `Generate a very short title (3-5 words max) for a conversation that starts with: "${firstMessage.slice(0, 200)}". Reply with only the title, no quotes.`
              }
            ]
          })
          const textBlock = response.content.find((b) => b.type === 'text')
          return textBlock ? (textBlock as Anthropic.TextBlock).text.trim() : 'New Chat'
        } else if (provider === 'openai') {
          const openai = new OpenAI({ apiKey: settings.openaiApiKey })
          const response = await openai.chat.completions.create({
            model,
            max_tokens: 30,
            messages: [
              {
                role: 'user',
                content: `Generate a very short title (3-5 words max) for a conversation that starts with: "${firstMessage.slice(0, 200)}". Reply with only the title, no quotes.`
              }
            ]
          })
          return response.choices[0]?.message?.content?.trim() ?? 'New Chat'
        }
      } catch {
        // ignore title errors
      }
      return 'New Chat'
    }
  )
}
