import { useState, useCallback, useEffect, useRef } from 'react'
import { useConversationsStore } from '../stores/conversations'
import { useSettingsStore } from '../stores/settings'
import type { Message, ContentBlock, ImageAttachment } from '../types'
import type { ChunkData } from '../../../main/ipc/chat'

interface UseChatReturn {
  isStreaming: boolean
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

export function useChat(conversationId: string | null): UseChatReturn {
  const [isStreaming, setIsStreaming] = useState(false)
  const { addMessage, updateLastMessage, updateMessageById, removeMessageById, renameConv } = useConversationsStore()
  useSettingsStore()
  const streamingMsgRef = useRef<Message | null>(null)
  const activeConvIdRef = useRef<string | null>(conversationId)

  useEffect(() => {
    activeConvIdRef.current = conversationId
  }, [conversationId])

  const stopStreaming = useCallback(() => {
    if (activeConvIdRef.current && isStreaming) {
      window.api.abortMessage(activeConvIdRef.current)
    }
  }, [isStreaming])

  const sendMessage = useCallback(
    async (text: string, model: string, provider: string, images?: ImageAttachment[]) => {
      const convId = activeConvIdRef.current
      if (!convId || isStreaming) return

      setIsStreaming(true)

      // Build image content blocks (data URL → pure base64)
      const imageBlocks: ContentBlock[] = (images ?? []).map((img) => ({
        type: 'image' as const,
        mediaType: img.mediaType,
        data: img.dataUrl.split(',')[1]
      }))

      // Add user message
      const userMsg: Message = {
        id: crypto.randomUUID(),
        role: 'user',
        blocks: [
          ...imageBlocks,
          ...(text.trim() ? [{ type: 'text' as const, text }] : [])
        ],
        timestamp: Date.now()
      }
      addMessage(convId, userMsg)

      // Get full conversation for context — read directly from store to avoid stale closure
      const conv = useConversationsStore.getState().conversations.find((c) => c.id === convId)
      const allMessages = conv ? [...conv.messages, userMsg] : [userMsg]

      // Create placeholder assistant message
      const assistantMsg: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        blocks: [],
        model,
        provider: provider as Message['provider'],
        timestamp: Date.now()
      }
      addMessage(convId, assistantMsg)
      streamingMsgRef.current = assistantMsg

      // Track whether error was already handled by the error chunk
      // (main process sends an error chunk AND re-throws, so both paths fire)
      let errorHandled = false

      const markError = (raw: string): void => {
        if (errorHandled) return
        errorHandled = true
        removeMessageById(convId, assistantMsg.id)
        updateMessageById(convId, userMsg.id, (m) => ({ ...m, error: formatApiError(raw) }))
        // Persist so the empty assistant placeholder isn't on disk at next startup
        const updatedConv = useConversationsStore.getState().conversations.find((c) => c.id === convId)
        if (updatedConv) window.api.updateConversation(updatedConv)
      }

      // Accumulate streaming state
      let currentBlocks: ContentBlock[] = []
      let currentTextIdx = -1
      let currentThinkingIdx = -1
      let currentToolIdx = -1
      let currentToolInput = ''

      const handleChunk = (data: ChunkData): void => {
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
          updateLastMessage(convId, (msg) => ({ ...msg, blocks: currentBlocks }))
        } else if (data.type === 'thinking_delta' && data.thinking) {
          if (currentThinkingIdx === -1) {
            currentThinkingIdx = currentBlocks.length
            currentBlocks = [...currentBlocks, { type: 'thinking', thinking: data.thinking }]
          } else {
            const block = currentBlocks[currentThinkingIdx] as {
              type: 'thinking'
              thinking: string
            }
            currentBlocks = [
              ...currentBlocks.slice(0, currentThinkingIdx),
              { ...block, thinking: block.thinking + data.thinking },
              ...currentBlocks.slice(currentThinkingIdx + 1)
            ]
          }
          updateLastMessage(convId, (msg) => ({ ...msg, blocks: currentBlocks }))
        } else if (data.type === 'tool_use_start') {
          currentToolIdx = currentBlocks.length
          currentToolInput = ''
          currentBlocks = [
            ...currentBlocks,
            {
              type: 'tool_use',
              id: data.toolUseId || crypto.randomUUID(),
              name: data.toolName || 'unknown',
              input: {}
            }
          ]
          updateLastMessage(convId, (msg) => ({ ...msg, blocks: currentBlocks }))
        } else if (data.type === 'turn_start') {
          // New API turn beginning — reset per-turn text/thinking indices so new
          // blocks are created rather than appending to blocks from the previous turn
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
          updateLastMessage(convId, (msg) => ({ ...msg, blocks: currentBlocks }))
        } else if (data.type === 'image_block' && data.imageData) {
          currentBlocks = [
            ...currentBlocks,
            {
              type: 'image' as const,
              mediaType: data.imageMediaType || 'image/png',
              data: data.imageData
            }
          ]
          updateLastMessage(convId, (msg) => ({ ...msg, blocks: currentBlocks }))
        } else if (data.type === 'tool_use_delta' && data.toolInput) {
          currentToolInput += data.toolInput
          if (currentToolIdx >= 0) {
            const block = currentBlocks[currentToolIdx] as {
              type: 'tool_use'
              id: string
              name: string
              input: unknown
            }
            let parsedInput: unknown = {}
            try {
              parsedInput = JSON.parse(currentToolInput)
            } catch {
              parsedInput = { raw: currentToolInput }
            }
            currentBlocks = [
              ...currentBlocks.slice(0, currentToolIdx),
              { ...block, input: parsedInput },
              ...currentBlocks.slice(currentToolIdx + 1)
            ]
            updateLastMessage(convId, (msg) => ({ ...msg, blocks: currentBlocks }))
          }
        } else if (data.type === 'done' && data.finalMessage) {
          // Replace placeholder with final message — use ID not index to avoid
          // targeting the wrong message if state shifted during streaming
          updateMessageById(convId, assistantMsg.id, () => ({ ...data.finalMessage!, id: assistantMsg.id }))
          // Persist to store
          const updatedConv = useConversationsStore
            .getState()
            .conversations.find((c) => c.id === convId)
          if (updatedConv) {
            window.api.updateConversation(updatedConv)
          }
        } else if (data.type === 'aborted') {
          // Preserve partial response — same as done but no error
          if (data.finalMessage) {
            updateMessageById(convId, assistantMsg.id, () => ({ ...data.finalMessage!, id: assistantMsg.id }))
            const updatedConv = useConversationsStore
              .getState()
              .conversations.find((c) => c.id === convId)
            if (updatedConv) window.api.updateConversation(updatedConv)
          }
        } else if (data.type === 'error') {
          markError(data.error || 'Unknown error')
        }
      }

      window.api.onChunk(handleChunk)

      try {
        await window.api.sendMessage({
          conversationId: convId,
          messages: allMessages,
          model,
          provider: provider as 'anthropic' | 'openai' | 'ollama',
          enableThinking: provider === 'anthropic' && model.includes('claude-3-7')
        })
      } catch (err) {
        markError(err instanceof Error ? err.message : String(err))
      } finally {
        window.api.offChunk(handleChunk)
        setIsStreaming(false)
        streamingMsgRef.current = null

        // Auto-title if first message
        const finalConv = useConversationsStore
          .getState()
          .conversations.find((c) => c.id === convId)
        if (finalConv && finalConv.title === 'New Chat' && finalConv.messages.length >= 2) {
          try {
            const title = await window.api.generateTitle({
              provider,
              model,
              firstMessage: text
            })
            if (title && title !== 'New Chat') {
              renameConv(convId, title)
            }
          } catch {
            // ignore
          }
        }
      }
    },
    [isStreaming, addMessage, updateLastMessage, updateMessageById, removeMessageById, renameConv]
  )

  const retryMessage = useCallback(
    async (msg: Message) => {
      const convId = activeConvIdRef.current
      if (!convId || isStreaming) return
      // Remove the failed user message — sendMessage will re-add it cleanly
      removeMessageById(convId, msg.id)
      const text = msg.blocks
        .filter((b) => b.type === 'text')
        .map((b) => (b as { type: 'text'; text: string }).text)
        .join('\n')
      const images: ImageAttachment[] = msg.blocks
        .filter((b) => b.type === 'image')
        .map((b) => {
          const img = b as { type: 'image'; mediaType: string; data: string }
          return { id: crypto.randomUUID(), dataUrl: `data:${img.mediaType};base64,${img.data}`, mediaType: img.mediaType }
        })
      const { settings } = useSettingsStore.getState()
      if (!settings) return
      await sendMessage(text, settings.defaultModel, settings.defaultProvider, images.length > 0 ? images : undefined)
    },
    [isStreaming, removeMessageById, sendMessage]
  )

  return { isStreaming, sendMessage, stopStreaming, retryMessage }
}
