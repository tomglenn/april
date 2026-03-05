import { useState, useCallback, useEffect, useRef } from 'react'
import { useConversationsStore } from '../stores/conversations'
import { useSettingsStore } from '../stores/settings'
import {
  buildSystemPrompt,
  messagesToAnthropicFormat,
  messagesToOpenAIFormat,
  getAvailableTools,
  runAnthropicLoop,
  runOpenAILoop,
  createFetchAnthropicCaller,
  createFetchOpenAICaller
} from '@april/core'
import type { Message, ContentBlock, ChunkData, ImageAttachment } from '@april/core'

export interface StreamingEntry {
  msgId: string
  blocks: ContentBlock[]
}

export type StreamingMap = Record<string, StreamingEntry>

interface UseChatReturn {
  isStreaming: boolean
  streamingState: StreamingMap
  sendMessage: (text: string, model: string, provider: string, images?: ImageAttachment[]) => Promise<void>
  stopStreaming: () => void
  retryMessage: (msg: Message) => Promise<void>
}

function formatApiError(raw: string): string {
  const jsonMatch = raw.match(/\{[\s\S]*\}/)
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0])
      const msg = (parsed?.error?.message ?? parsed?.message) as string | undefined
      if (msg) {
        if (/api.?key|authentication|invalid x-api/i.test(msg)) return 'Invalid API key — check Settings.'
        if (/rate.?limit/i.test(msg)) return 'Rate limit reached — try again in a moment.'
        if (/quota|billing|insufficient_quota/i.test(msg)) return 'API quota exceeded — check your billing.'
        if (/context.?length|too.?long|maximum.?token/i.test(msg)) return 'Message is too long for this model.'
        return msg
      }
    } catch { /* fall through */ }
  }
  const status = raw.match(/\b([45]\d\d)\b/)?.[1]
  if (status === '401') return 'Invalid API key — check Settings.'
  if (status === '403') return 'Access denied — check your API key permissions.'
  if (status === '429') return 'Rate limit reached — try again in a moment.'
  if (status === '500' || status === '502' || status === '503') return 'Server error — try again shortly.'
  return 'Something went wrong — please try again.'
}

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

export function useChat(conversationId: string | null): UseChatReturn {
  const [streamingState, setStreamingState] = useState<StreamingMap>({})
  const { addMessage, updateMessageById, removeMessageById, renameConv, persistConversation } = useConversationsStore()
  useSettingsStore()
  const activeConvIdRef = useRef<string | null>(conversationId)
  const streamingConvIdsRef = useRef<Set<string>>(new Set())
  const abortControllers = useRef<Map<string, AbortController>>(new Map())
  const isStreaming = Object.keys(streamingState).length > 0

  useEffect(() => {
    activeConvIdRef.current = conversationId
  }, [conversationId])

  const stopStreaming = useCallback(() => {
    const target = activeConvIdRef.current
    if (target) {
      abortControllers.current.get(target)?.abort()
    }
  }, [])

  const sendMessage = useCallback(
    async (text: string, model: string, provider: string, images?: ImageAttachment[]) => {
      const convId = activeConvIdRef.current
      if (!convId || streamingConvIdsRef.current.has(convId)) return

      const settings = useSettingsStore.getState().settings
      if (!settings) return

      // Build image content blocks
      const imageBlocks: ContentBlock[] = (images ?? []).map((img) => ({
        type: 'image' as const,
        mediaType: img.mediaType,
        data: img.dataUrl.split(',')[1]
      }))

      // Add user message
      const userMsg: Message = {
        id: generateUUID(),
        role: 'user',
        blocks: [
          ...imageBlocks,
          ...(text.trim() ? [{ type: 'text' as const, text }] : [])
        ],
        timestamp: Date.now()
      }
      addMessage(convId, userMsg)

      // Get full conversation — addMessage is synchronous (Zustand set())
      const conv = useConversationsStore.getState().conversations.find((c) => c.id === convId)
      const allMessages = conv?.messages ?? [userMsg]

      // Create placeholder assistant message
      const assistantMsg: Message = {
        id: generateUUID(),
        role: 'assistant',
        blocks: [],
        model,
        provider: provider as Message['provider'],
        timestamp: Date.now()
      }
      addMessage(convId, assistantMsg)
      const msgId = assistantMsg.id

      let errorHandled = false

      const markError = (raw: string): void => {
        if (errorHandled) return
        errorHandled = true
        setStreamingState((prev) => { const { [convId]: _, ...rest } = prev; return rest })
        const c = useConversationsStore.getState().conversations.find((c) => c.id === convId)
        const placeholder = c?.messages.find((m) => m.id === assistantMsg.id)
        if (placeholder && placeholder.blocks.length === 0) {
          removeMessageById(convId, assistantMsg.id)
        }
        updateMessageById(convId, userMsg.id, (m) => ({ ...m, error: formatApiError(raw) }))
      }

      // Accumulate streaming state in closure
      let currentBlocks: ContentBlock[] = []
      let currentTextIdx = -1
      let currentThinkingIdx = -1
      let currentToolIdx = -1
      let currentToolInput = ''

      const pushBlocks = (): void => {
        setStreamingState((prev) => ({ ...prev, [convId]: { msgId, blocks: currentBlocks } }))
      }

      const sendChunk = (data: ChunkData): void => {
        if (data.type === 'text_delta' && data.text) {
          if (currentTextIdx === -1) {
            currentTextIdx = currentBlocks.length
            currentBlocks = [...currentBlocks, { type: 'text', text: data.text }]
          } else {
            const block = currentBlocks[currentTextIdx] as { type: 'text'; text: string }
            currentBlocks = [
              ...currentBlocks.slice(0, currentTextIdx),
              { ...block, text: block.text + data.text },
              ...currentBlocks.slice(currentTextIdx + 1)
            ]
          }
          pushBlocks()
        } else if (data.type === 'thinking_delta' && data.thinking) {
          if (currentThinkingIdx === -1) {
            currentThinkingIdx = currentBlocks.length
            currentBlocks = [...currentBlocks, { type: 'thinking', thinking: data.thinking }]
          } else {
            const block = currentBlocks[currentThinkingIdx] as { type: 'thinking'; thinking: string }
            currentBlocks = [
              ...currentBlocks.slice(0, currentThinkingIdx),
              { ...block, thinking: block.thinking + data.thinking },
              ...currentBlocks.slice(currentThinkingIdx + 1)
            ]
          }
          pushBlocks()
        } else if (data.type === 'tool_use_start') {
          currentToolIdx = currentBlocks.length
          currentToolInput = ''
          currentBlocks = [
            ...currentBlocks,
            {
              type: 'tool_use',
              id: data.toolUseId || generateUUID(),
              name: data.toolName || 'unknown',
              input: {}
            }
          ]
          pushBlocks()
        } else if (data.type === 'turn_start') {
          currentTextIdx = -1
          currentThinkingIdx = -1
          currentToolIdx = -1
          currentToolInput = ''
        } else if (data.type === 'tool_result') {
          currentBlocks = [
            ...currentBlocks,
            {
              type: 'tool_result',
              tool_use_id: data.toolUseId || '',
              content: data.content || ''
            }
          ]
          pushBlocks()
        } else if (data.type === 'image_block' && data.imageData) {
          currentBlocks = [
            ...currentBlocks,
            {
              type: 'image' as const,
              mediaType: data.imageMediaType || 'image/png',
              data: data.imageData
            }
          ]
          pushBlocks()
        } else if (data.type === 'tool_use_delta' && data.toolInput) {
          currentToolInput += data.toolInput
          if (currentToolIdx >= 0) {
            const block = currentBlocks[currentToolIdx] as {
              type: 'tool_use'; id: string; name: string; input: unknown
            }
            let parsedInput: unknown = {}
            try { parsedInput = JSON.parse(currentToolInput) } catch { parsedInput = { raw: currentToolInput } }
            currentBlocks = [
              ...currentBlocks.slice(0, currentToolIdx),
              { ...block, input: parsedInput },
              ...currentBlocks.slice(currentToolIdx + 1)
            ]
            pushBlocks()
          }
        } else if (data.type === 'error') {
          markError(data.error || 'Unknown error')
        }
        // done/aborted are handled in the finally block
      }

      streamingConvIdsRef.current.add(convId)
      setStreamingState((prev) => ({ ...prev, [convId]: { msgId, blocks: [] } }))

      const controller = new AbortController()
      abortControllers.current.set(convId, controller)

      let finalMsg: Message | null = null
      try {
        const systemPrompt = buildSystemPrompt(settings)
        const availableTools = getAvailableTools(settings)

        if (provider === 'anthropic') {
          const caller = createFetchAnthropicCaller(settings.anthropicApiKey)
          const anthropicMessages = messagesToAnthropicFormat(allMessages)

          // Prompt caching markers
          const cachedSystem = systemPrompt
            ? [{ type: 'text' as const, text: systemPrompt, cache_control: { type: 'ephemeral' as const } }]
            : undefined
          const cachedTools = availableTools.map((t, i) =>
            i === availableTools.length - 1
              ? { ...t, cache_control: { type: 'ephemeral' as const } }
              : t
          )

          const enableThinking = model.includes('claude-3-7')
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const baseParams: any = {
            model,
            max_tokens: enableThinking ? 16000 : 8096,
            system: cachedSystem,
            tools: cachedTools,
            messages: anthropicMessages
          }
          if (enableThinking) {
            baseParams.thinking = { type: 'enabled', budget_tokens: 10000 }
            baseParams.betas = ['thinking-2025-01-15']
          }

          finalMsg = await runAnthropicLoop(
            caller, baseParams, sendChunk, controller.signal,
            settings.openaiApiKey, convId, settings.anthropicApiKey,
            settings.recentContextExchanges
          )
        } else if (provider === 'openai') {
          const caller = createFetchOpenAICaller(settings.openaiApiKey)
          const openaiMessages = [
            ...(systemPrompt ? [{ role: 'system' as const, content: systemPrompt }] : []),
            ...messagesToOpenAIFormat(allMessages)
          ]
          finalMsg = await runOpenAILoop(
            caller, model, openaiMessages, sendChunk, controller.signal,
            availableTools, settings.openaiApiKey, convId, 'openai',
            settings.recentContextExchanges
          )
        }
      } catch (err) {
        markError(err instanceof Error ? err.message : String(err))
      } finally {
        abortControllers.current.delete(convId)

        // Commit final message to store
        if (finalMsg && !errorHandled) {
          const finalMessage: Message = { ...finalMsg, id: msgId }
          const c = useConversationsStore.getState().conversations.find((c) => c.id === convId)
          const placeholderExists = c?.messages.some((m) => m.id === msgId)
          if (placeholderExists) {
            updateMessageById(convId, msgId, () => finalMessage)
          } else {
            addMessage(convId, finalMessage)
          }
        }

        // Single persist point
        await persistConversation(convId)

        setStreamingState((prev) => { const { [convId]: _, ...rest } = prev; return rest })
        streamingConvIdsRef.current.delete(convId)

        // Auto-title
        const finalConv = useConversationsStore.getState().conversations.find((c) => c.id === convId)
        if (finalConv && finalConv.title === 'New Chat' && finalConv.messages.length >= 2) {
          try {
            const title = await generateTitle(provider, model, text, settings)
            if (title && title !== 'New Chat') {
              renameConv(convId, title)
            }
          } catch { /* ignore */ }
        }
      }
    },
    [addMessage, updateMessageById, removeMessageById, renameConv, persistConversation]
  )

  const retryMessage = useCallback(
    async (msg: Message) => {
      const convId = activeConvIdRef.current
      if (!convId || streamingConvIdsRef.current.has(convId)) return
      removeMessageById(convId, msg.id)
      const text = msg.blocks
        .filter((b) => b.type === 'text')
        .map((b) => (b as { type: 'text'; text: string }).text)
        .join('\n')
      const images: ImageAttachment[] = msg.blocks
        .filter((b) => b.type === 'image')
        .map((b) => {
          const img = b as { type: 'image'; mediaType: string; data: string }
          return { id: generateUUID(), dataUrl: `data:${img.mediaType};base64,${img.data}`, mediaType: img.mediaType }
        })
      const { settings } = useSettingsStore.getState()
      if (!settings) return
      await sendMessage(text, settings.defaultModel, settings.defaultProvider, images.length > 0 ? images : undefined)
    },
    [removeMessageById, sendMessage]
  )

  return { isStreaming, streamingState, sendMessage, stopStreaming, retryMessage }
}

async function generateTitle(
  provider: string,
  model: string,
  firstMessage: string,
  settings: { anthropicApiKey: string; openaiApiKey: string }
): Promise<string> {
  const prompt = `Generate a very short title (3-5 words max) for a conversation that starts with: "${firstMessage.slice(0, 200)}". Reply with only the title, no quotes.`

  if (provider === 'anthropic') {
    const caller = createFetchAnthropicCaller(settings.anthropicApiKey)
    const response = await caller.createMessage({
      model,
      max_tokens: 30,
      messages: [{ role: 'user', content: prompt }]
    })
    const textBlock = response.content.find((b) => b.type === 'text')
    return textBlock?.text?.trim() ?? 'New Chat'
  } else if (provider === 'openai') {
    const caller = createFetchOpenAICaller(settings.openaiApiKey)
    const response = await caller.createChat({
      model,
      max_tokens: 30,
      messages: [{ role: 'user', content: prompt }]
    })
    return response.choices[0]?.message?.content?.trim() ?? 'New Chat'
  }
  return 'New Chat'
}
