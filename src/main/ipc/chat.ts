import { ipcMain } from 'electron'
import { setMaxListeners } from 'events'
import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import { getSettings } from '../store'
import { TOOLS, executeTool } from '../tools'
import { mcpManager } from '../mcp'
import type { ToolDefinition } from '../tools'
import type { Settings, Message, ContentBlock } from '../../renderer/src/types'

export interface SendMessagePayload {
  conversationId: string
  messages: Message[]
  model: string
  provider: 'anthropic' | 'openai' | 'ollama'
  enableThinking?: boolean
}

export interface ChunkData {
  type:
    | 'text_delta'
    | 'thinking_delta'
    | 'tool_use_start'
    | 'tool_use_delta'
    | 'tool_result'
    | 'image_block'
    | 'turn_start'
    | 'done'
    | 'aborted'
    | 'error'
  text?: string
  thinking?: string
  toolUseId?: string
  toolName?: string
  toolInput?: string
  content?: string
  error?: string
  finalMessage?: Message
  imageData?: string
  imageMediaType?: string
  conversationId?: string
}

// ── Image result parser ────────────────────────────────────────────────────────

function parseImageResult(result: string): { mediaType: string; data: string } | null {
  if (!result.startsWith('data:image/')) return null
  const commaIdx = result.indexOf(',')
  if (commaIdx === -1) return null
  const mediaType = result.slice(5, commaIdx).split(';')[0]
  const data = result.slice(commaIdx + 1)
  return { mediaType, data }
}

// ── Abort registry ────────────────────────────────────────────────────────────

const abortControllers = new Map<string, AbortController>()

// ── Format converters ─────────────────────────────────────────────────────────

function messagesToAnthropicFormat(messages: Message[]): Anthropic.MessageParam[] {
  const result: Anthropic.MessageParam[] = []

  for (const msg of messages) {
    if (msg.role === 'user') {
      const imageBlocks = msg.blocks
        .filter((b) => b.type === 'image')
        .map((b) => {
          const img = b as { type: 'image'; mediaType: string; data: string }
          return {
            type: 'image' as const,
            source: {
              type: 'base64' as const,
              media_type: img.mediaType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
              data: img.data
            }
          }
        })
      const textBlocks = msg.blocks
        .filter((b) => b.type === 'text')
        .map((b) => ({ type: 'text' as const, text: (b as { type: 'text'; text: string }).text }))
      result.push({ role: 'user' as const, content: [...imageBlocks, ...textBlocks] })
      continue
    }

    // Assistant messages may contain interleaved tool_use / tool_result blocks
    // from a multi-turn tool-use exchange that we flattened into one Message.
    // We need to re-split them so tool_result blocks go into user turns, e.g.:
    //   [text, tool_use, tool_result, text]
    //   → assistant:[text, tool_use]  user:[tool_result]  assistant:[text]
    let assistantContent: Anthropic.ContentBlockParam[] = []
    let toolResults: Anthropic.ToolResultBlockParam[] = []

    for (const block of msg.blocks) {
      if (block.type === 'tool_result') {
        // Flush any pending assistant content before starting the tool-result user turn
        if (assistantContent.length > 0) {
          result.push({ role: 'assistant' as const, content: assistantContent })
          assistantContent = []
        }
        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.tool_use_id,
          content: block.content
        })
      } else {
        // Flush any pending tool results as a user turn before continuing assistant content
        if (toolResults.length > 0) {
          result.push({ role: 'user' as const, content: toolResults })
          toolResults = []
        }
        if (block.type === 'text') {
          assistantContent.push({ type: 'text', text: block.text })
        } else if (block.type === 'tool_use') {
          assistantContent.push({
            type: 'tool_use',
            id: block.id,
            name: block.name,
            input: block.input as Record<string, unknown>
          })
        }
        // thinking blocks are skipped — they can't be replayed in history
      }
    }

    // Flush remainders
    if (toolResults.length > 0) {
      if (assistantContent.length > 0) {
        result.push({ role: 'assistant' as const, content: assistantContent })
        assistantContent = []
      }
      result.push({ role: 'user' as const, content: toolResults })
    }
    if (assistantContent.length > 0) {
      result.push({ role: 'assistant' as const, content: assistantContent })
    }
  }

  return result
}

function messagesToOpenAIFormat(messages: Message[]): OpenAI.ChatCompletionMessageParam[] {
  return messages.map((msg) => {
    if (msg.role === 'user' && msg.blocks.some((b) => b.type === 'image')) {
      const content: OpenAI.ChatCompletionContentPart[] = [
        ...msg.blocks
          .filter((b) => b.type === 'image')
          .map((b) => {
            const img = b as { type: 'image'; mediaType: string; data: string }
            return {
              type: 'image_url' as const,
              image_url: { url: `data:${img.mediaType};base64,${img.data}` }
            }
          }),
        ...msg.blocks
          .filter((b) => b.type === 'text')
          .map((b) => ({
            type: 'text' as const,
            text: (b as { type: 'text'; text: string }).text
          }))
      ]
      return { role: 'user' as const, content }
    }
    const text = msg.blocks
      .filter((b) => b.type === 'text')
      .map((b) => (b as { type: 'text'; text: string }).text)
      .join('\n')
    return { role: msg.role as 'user' | 'assistant', content: text }
  })
}

// ── System prompt helper ──────────────────────────────────────────────────────

function buildSystemPrompt(raw: string, settings: Settings): string {
  const date = new Date().toLocaleDateString('en-GB', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })
  let prompt = raw.replace('{{date}}', date)

  const parts: string[] = []
  if (settings.userName) parts.push(`The user's name is ${settings.userName}.`)
  if (settings.userLocation) parts.push(`They are based in ${settings.userLocation}.`)
  if (settings.userBio) parts.push(settings.userBio)
  if (parts.length > 0) {
    prompt += '\n\n## About the user\n' + parts.join(' ')
  }

  const memories = settings.memories ?? []
  if (memories.length > 0) {
    prompt += '\n\n## Your memories about the user\n'
    prompt += memories.map((m) => `- ${m.content} [id: ${m.id}]`).join('\n')
  }

  prompt += `\n\n## Memory
You have persistent memory across conversations.${memories.length > 0 ? ' Your current memories are listed above.' : ''}
- When the user shares personal details, preferences, or important facts, proactively save them using the save_memory tool.
- Store atomic facts — one concept per memory. Prefer updating (delete old + save new) over duplicating.
- When the user asks you to forget something, use delete_memory with the relevant ID.
- Don't mention your memory system unless the user asks about it.`

  return prompt
}

// ── Anthropic agentic loop ────────────────────────────────────────────────────

async function runAnthropicLoop(
  anthropic: Anthropic,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  baseParams: any,
  sendChunk: (data: ChunkData) => void,
  signal: AbortSignal
): Promise<Message> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const messages: any[] = [...baseParams.messages]
  const allBlocks: ContentBlock[] = []

  const makePartialMessage = (): Message => ({
    id: crypto.randomUUID(),
    role: 'assistant',
    blocks: allBlocks,
    model: baseParams.model,
    provider: 'anthropic',
    timestamp: Date.now()
  })

  while (true) {
    // Signal renderer to reset its per-turn block indices
    if (allBlocks.length > 0) sendChunk({ type: 'turn_start' })

    const stream = anthropic.messages.stream({ ...baseParams, messages }, { signal })

    // Collect tool_use blocks from this turn so we can execute them
    const turnToolUses: Array<{ id: string; name: string; input: string }> = []
    let currentToolUseEntry: { id: string; name: string; input: string } | null = null
    let stopReason = 'end_turn'

    try {
      for await (const ev of stream) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const event = ev as any

        if (event.type === 'message_delta') {
          stopReason = event.delta.stop_reason ?? 'end_turn'
        } else if (event.type === 'content_block_start') {
          const cb = event.content_block
          if (cb.type === 'text') {
            allBlocks.push({ type: 'text', text: '' })
          } else if (cb.type === 'thinking') {
            allBlocks.push({ type: 'thinking', thinking: '' })
          } else if (cb.type === 'tool_use') {
            allBlocks.push({ type: 'tool_use', id: cb.id, name: cb.name, input: {} })
            currentToolUseEntry = { id: cb.id, name: cb.name, input: '' }
            sendChunk({ type: 'tool_use_start', toolUseId: cb.id, toolName: cb.name })
          }
        } else if (event.type === 'content_block_delta') {
          const last = allBlocks[allBlocks.length - 1]
          if (event.delta.type === 'text_delta') {
            if (last?.type === 'text') last.text += event.delta.text
            sendChunk({ type: 'text_delta', text: event.delta.text })
          } else if (event.delta.type === 'thinking_delta') {
            if (last?.type === 'thinking') last.thinking += event.delta.thinking
            sendChunk({ type: 'thinking_delta', thinking: event.delta.thinking })
          } else if (event.delta.type === 'input_json_delta') {
            if (currentToolUseEntry) {
              currentToolUseEntry.input += event.delta.partial_json
              sendChunk({ type: 'tool_use_delta', toolInput: event.delta.partial_json })
            }
          }
        } else if (event.type === 'content_block_stop') {
          if (currentToolUseEntry) {
            try {
              const parsedInput = JSON.parse(currentToolUseEntry.input || '{}')
              const block = allBlocks.find(
                (b) => b.type === 'tool_use' && (b as { id: string }).id === currentToolUseEntry!.id
              ) as { type: 'tool_use'; id: string; name: string; input: unknown } | undefined
              if (block) block.input = parsedInput
            } catch {
              // leave input as-is
            }
            turnToolUses.push(currentToolUseEntry)
            currentToolUseEntry = null
          }
        }
      }
    } catch (err: unknown) {
      const e = err as { name?: string }
      if (signal.aborted || e?.name === 'AbortError') return makePartialMessage()
      throw err
    }

    // Stop tool execution if aborted
    if (signal.aborted) break

    if (stopReason !== 'tool_use' || turnToolUses.length === 0) break

    // Build the assistant turn message for the API (using the raw finalMessage)
    const finalMsg = await stream.finalMessage()
    messages.push({ role: 'assistant', content: finalMsg.content })

    // Execute each tool and collect results
    const toolResults: Anthropic.ToolResultBlockParam[] = []
    for (const tu of turnToolUses) {
      const input = (() => {
        try { return JSON.parse(tu.input || '{}') } catch { return {} }
      })()
      const result = await executeTool(tu.name, input)
      const img = parseImageResult(result)

      if (img) {
        allBlocks.push({ type: 'image', mediaType: img.mediaType, data: img.data })
        sendChunk({ type: 'image_block', imageData: img.data, imageMediaType: img.mediaType })
        const successText = 'Image generated successfully.'
        allBlocks.push({ type: 'tool_result', tool_use_id: tu.id, content: successText })
        sendChunk({ type: 'tool_result', toolUseId: tu.id, content: successText })
        toolResults.push({ type: 'tool_result', tool_use_id: tu.id, content: successText })
      } else {
        allBlocks.push({ type: 'tool_result', tool_use_id: tu.id, content: result })
        sendChunk({ type: 'tool_result', toolUseId: tu.id, content: result })
        toolResults.push({ type: 'tool_result', tool_use_id: tu.id, content: result })
      }
    }

    // Feed results back as a user turn and loop
    messages.push({ role: 'user', content: toolResults })
  }

  return makePartialMessage()
}

// ── OpenAI agentic loop ───────────────────────────────────────────────────────

async function runOpenAILoop(
  openai: OpenAI,
  model: string,
  initialMessages: OpenAI.ChatCompletionMessageParam[],
  sendChunk: (data: ChunkData) => void,
  signal: AbortSignal,
  tools: ToolDefinition[] = []
): Promise<Message> {
  const messages = [...initialMessages]
  const allBlocks: ContentBlock[] = []

  const openaiTools: OpenAI.ChatCompletionTool[] = tools.map((t) => ({
    type: 'function' as const,
    function: { name: t.name, description: t.description, parameters: t.input_schema }
  }))

  const makePartialMessage = (): Message => ({
    id: crypto.randomUUID(),
    role: 'assistant',
    blocks: allBlocks,
    model,
    provider: 'openai',
    timestamp: Date.now()
  })

  while (true) {
    if (allBlocks.length > 0) sendChunk({ type: 'turn_start' })

    let stream: Awaited<ReturnType<typeof openai.chat.completions.create>>
    try {
      stream = await openai.chat.completions.create(
        { model, messages, ...(openaiTools.length > 0 && { tools: openaiTools }), stream: true },
        { signal }
      )
    } catch (err: unknown) {
      const e = err as { name?: string }
      if (signal.aborted || e?.name === 'AbortError') return makePartialMessage()
      throw err
    }

    let fullText = ''
    const toolCallAccumulators: Record<string, { name: string; arguments: string }> = {}
    let finishReason = 'stop'

    try {
      for await (const chunk of stream) {
        const choice = chunk.choices[0]
        if (!choice) continue
        finishReason = choice.finish_reason ?? finishReason

        const delta = choice.delta
        if (delta.content) {
          fullText += delta.content
          sendChunk({ type: 'text_delta', text: delta.content })
        }
        if (delta.tool_calls) {
          for (const tc of delta.tool_calls) {
            if (!toolCallAccumulators[tc.index]) {
              toolCallAccumulators[tc.index] = { name: '', arguments: '' }
              sendChunk({
                type: 'tool_use_start',
                toolUseId: tc.id ?? String(tc.index),
                toolName: tc.function?.name ?? ''
              })
            }
            if (tc.function?.name) toolCallAccumulators[tc.index].name += tc.function.name
            if (tc.function?.arguments) {
              toolCallAccumulators[tc.index].arguments += tc.function.arguments
              sendChunk({ type: 'tool_use_delta', toolInput: tc.function.arguments })
            }
          }
        }
      }
    } catch (err: unknown) {
      const e = err as { name?: string }
      if (signal.aborted || e?.name === 'AbortError') {
        if (fullText) allBlocks.push({ type: 'text', text: fullText })
        return makePartialMessage()
      }
      throw err
    }

    if (fullText) allBlocks.push({ type: 'text', text: fullText })

    // Stop tool execution if aborted
    if (signal.aborted) break

    if (finishReason !== 'tool_calls' || Object.keys(toolCallAccumulators).length === 0) break

    // Add assistant message with tool_calls
    const toolCalls: OpenAI.ChatCompletionMessageToolCall[] = Object.entries(toolCallAccumulators).map(
      ([index, acc]) => ({
        id: `call_${index}`,
        type: 'function' as const,
        function: { name: acc.name, arguments: acc.arguments }
      })
    )
    messages.push({ role: 'assistant', content: fullText || null, tool_calls: toolCalls })

    // Execute tools
    for (const tc of toolCalls) {
      const input = (() => {
        try { return JSON.parse(tc.function.arguments) } catch { return {} }
      })()
      const result = await executeTool(tc.function.name, input)
      const img = parseImageResult(result)
      const toolContent = img ? 'Image generated successfully.' : result

      allBlocks.push({ type: 'tool_use', id: tc.id, name: tc.function.name, input })
      if (img) {
        allBlocks.push({ type: 'image', mediaType: img.mediaType, data: img.data })
        sendChunk({ type: 'image_block', imageData: img.data, imageMediaType: img.mediaType })
      }
      allBlocks.push({ type: 'tool_result', tool_use_id: tc.id, content: toolContent })
      sendChunk({ type: 'tool_result', toolUseId: tc.id, content: toolContent })
      messages.push({ role: 'tool', tool_call_id: tc.id, content: toolContent })
    }
  }

  return makePartialMessage()
}

// ── IPC registration ──────────────────────────────────────────────────────────

export function registerChatHandlers(): void {
  ipcMain.handle('chat:send', async (event, payload: SendMessagePayload) => {
    const settings = getSettings()
    const sender = event.sender
    const systemPrompt = buildSystemPrompt(settings.systemPrompt || '', settings)

    const controller = new AbortController()
    // Each loop iteration (tool call) attaches a listener to the signal via the SDK stream;
    // raise the limit so long tool chains don't trigger the MaxListeners warning.
    setMaxListeners(0, controller.signal)
    abortControllers.set(payload.conversationId, controller)

    const sendChunk = (data: ChunkData): void => {
      if (!sender.isDestroyed()) sender.send('chat:chunk', { ...data, conversationId: payload.conversationId })
    }

    let finalMsg: Message | null = null

    try {
      const availableTools: ToolDefinition[] = [
        ...TOOLS.filter((t) => t.name !== 'generate_image' || !!settings.openaiApiKey),
        ...mcpManager.getToolDefinitions()
      ]

      if (payload.provider === 'anthropic') {
        const anthropic = new Anthropic({ apiKey: settings.anthropicApiKey })
        const anthropicMessages = messagesToAnthropicFormat(payload.messages)

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const baseParams: any = {
          model: payload.model,
          max_tokens: payload.enableThinking ? 16000 : 8096,
          system: systemPrompt || undefined,
          tools: availableTools,
          messages: anthropicMessages
        }

        if (payload.enableThinking) {
          baseParams.thinking = { type: 'enabled', budget_tokens: 10000 }
          baseParams.betas = ['thinking-2025-01-15']
        }

        finalMsg = await runAnthropicLoop(anthropic, baseParams, sendChunk, controller.signal)
      } else if (payload.provider === 'openai' || payload.provider === 'ollama') {
        const openai = new OpenAI({
          apiKey: payload.provider === 'openai' ? settings.openaiApiKey : 'ollama',
          baseURL: payload.provider === 'ollama' ? `${settings.ollamaBaseUrl}/v1` : undefined
        })

        const openaiMessages: OpenAI.ChatCompletionMessageParam[] = [
          ...(systemPrompt ? [{ role: 'system' as const, content: systemPrompt }] : []),
          ...messagesToOpenAIFormat(payload.messages)
        ]

        finalMsg = await runOpenAILoop(openai, payload.model, openaiMessages, sendChunk, controller.signal, payload.provider === 'openai' ? availableTools : [])
        if (finalMsg) finalMsg.provider = payload.provider
      }
    } catch (err) {
      if (!controller.signal.aborted) {
        const error = err instanceof Error ? err.message : String(err)
        sendChunk({ type: 'error', error })
      }
    } finally {
      abortControllers.delete(payload.conversationId)
      // Always send done/aborted so the renderer clears streaming state,
      // even if an error was already sent above.
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
