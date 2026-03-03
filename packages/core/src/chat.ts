import Anthropic from '@anthropic-ai/sdk'
import type { MessageCreateParamsStreaming } from '@anthropic-ai/sdk/resources/messages'
import OpenAI from 'openai'
import { DEFAULT_SYSTEM_PROMPT } from './constants'
import { executeTool, TOOLS } from './tools'
import { mcpManager } from './mcp'
import { estimateTokens, truncateAnthropicMessages, truncateOpenAIMessages, summariseAnthropicMessages, summariseOpenAIMessages } from './context'
import type { ToolDefinition } from './tools'
import type { Settings, Message, ContentBlock } from './types'

const MAX_TOOL_RESULT_CHARS = 12_000
const MAX_TOOL_TURNS = 15
const MAX_MEMORIES = 50

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

// ── Format converters ─────────────────────────────────────────────────────────

export function messagesToAnthropicFormat(messages: Message[]): Anthropic.MessageParam[] {
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

export function messagesToOpenAIFormat(messages: Message[]): OpenAI.ChatCompletionMessageParam[] {
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

export function buildSystemPrompt(settings: Settings): string {
  const date = new Date().toLocaleDateString('en-GB', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })
  let prompt = DEFAULT_SYSTEM_PROMPT.replace('{{date}}', date)

  if (settings.personalityPrompt) {
    prompt += '\n\n' + settings.personalityPrompt
  }

  const parts: string[] = []
  if (settings.userName) parts.push(`The user's name is ${settings.userName}.`)
  if (settings.userLocation) parts.push(`They are based in ${settings.userLocation}.`)
  if (settings.userBio) parts.push(settings.userBio)
  if (parts.length > 0) {
    prompt += '\n\n## About the user\n' + parts.join(' ')
  }

  const allMemories = settings.memories ?? []
  const memories = allMemories
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, MAX_MEMORIES)
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

export async function runAnthropicLoop(
  anthropic: Anthropic,
  baseParams: MessageCreateParamsStreaming,
  sendChunk: (data: ChunkData) => void,
  signal: AbortSignal,
  openaiApiKey?: string,
  conversationId?: string,
  anthropicApiKey?: string
): Promise<Message> {
  const messages: Anthropic.MessageParam[] = [...baseParams.messages]
  const allBlocks: ContentBlock[] = []

  const makePartialMessage = (): Message => ({
    id: crypto.randomUUID(),
    role: 'assistant',
    blocks: allBlocks,
    model: baseParams.model,
    provider: 'anthropic',
    timestamp: Date.now()
  })

  // Summarise once before the agentic loop — tool iterations won't re-trigger
  const baseMessageCount = messages.length
  let summarisedBase: Anthropic.MessageParam[] | null = null
  if (conversationId && anthropicApiKey) {
    summarisedBase = await summariseAnthropicMessages(conversationId, messages, anthropicApiKey)
  }

  let toolTurns = 0
  while (true) {
    // Signal renderer to reset its per-turn block indices
    if (allBlocks.length > 0) sendChunk({ type: 'turn_start' })

    const systemChars = typeof baseParams.system === 'string'
      ? baseParams.system.length
      : JSON.stringify(baseParams.system ?? '').length

    // Use pre-summarised base + any tool messages added during the loop
    const loopMessages = messages.slice(baseMessageCount)
    const effectiveMessages = summarisedBase
      ? [...summarisedBase, ...loopMessages]
      : messages
    const trimmedMessages = truncateAnthropicMessages(effectiveMessages, baseParams.model, systemChars)
    const cachedTokens = estimateTokens(baseParams.system ?? '', baseParams.tools ?? [])
    const messageTokens = estimateTokens(trimmedMessages)
    console.log(`[api] ~${cachedTokens + messageTokens} input tokens (~${cachedTokens} cached, ~${messageTokens} uncached) → ${baseParams.model}`)

    const stream = anthropic.messages.stream({ ...baseParams, messages: trimmedMessages }, { signal })

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

    toolTurns++
    if (toolTurns >= MAX_TOOL_TURNS) {
      allBlocks.push({ type: 'text', text: '\n\n[Stopped: reached maximum tool iterations]' })
      sendChunk({ type: 'text_delta', text: '\n\n[Stopped: reached maximum tool iterations]' })
      break
    }

    // Build the assistant turn message for the API (using the raw finalMessage)
    const finalMsg = await stream.finalMessage()
    messages.push({ role: 'assistant', content: finalMsg.content })

    // Execute each tool and collect results
    const toolResults: Anthropic.ToolResultBlockParam[] = []
    for (const tu of turnToolUses) {
      const input = (() => {
        try { return JSON.parse(tu.input || '{}') } catch { return {} }
      })()
      const result = await executeTool(tu.name, input, openaiApiKey)

      if (result.type === 'image') {
        allBlocks.push({ type: 'image', mediaType: result.mediaType, data: result.data })
        sendChunk({ type: 'image_block', imageData: result.data, imageMediaType: result.mediaType })
        const successText = 'Image generated successfully.'
        allBlocks.push({ type: 'tool_result', tool_use_id: tu.id, content: successText })
        sendChunk({ type: 'tool_result', toolUseId: tu.id, content: successText })
        toolResults.push({ type: 'tool_result', tool_use_id: tu.id, content: successText })
      } else {
        const content = result.content.length > MAX_TOOL_RESULT_CHARS
          ? result.content.slice(0, MAX_TOOL_RESULT_CHARS) + '\n\n[Result truncated]'
          : result.content
        allBlocks.push({ type: 'tool_result', tool_use_id: tu.id, content })
        sendChunk({ type: 'tool_result', toolUseId: tu.id, content })
        toolResults.push({ type: 'tool_result', tool_use_id: tu.id, content })
      }
    }

    // Feed results back as a user turn and loop
    messages.push({ role: 'user', content: toolResults })
  }

  return makePartialMessage()
}

// ── OpenAI agentic loop ───────────────────────────────────────────────────────

export async function runOpenAILoop(
  openai: OpenAI,
  model: string,
  initialMessages: OpenAI.ChatCompletionMessageParam[],
  sendChunk: (data: ChunkData) => void,
  signal: AbortSignal,
  tools: ToolDefinition[] = [],
  openaiApiKey?: string,
  conversationId?: string,
  provider?: 'openai' | 'ollama'
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

  // Summarise once before the agentic loop — tool iterations won't re-trigger
  const baseMessageCount = messages.length
  let summarisedBase: OpenAI.ChatCompletionMessageParam[] | null = null
  if (conversationId && openaiApiKey && provider) {
    summarisedBase = await summariseOpenAIMessages(conversationId, messages, openaiApiKey, provider)
  }

  let toolTurns = 0
  while (true) {
    if (allBlocks.length > 0) sendChunk({ type: 'turn_start' })

    // Use pre-summarised base + any tool messages added during the loop
    const loopMessages = messages.slice(baseMessageCount)
    const effectiveMessages = summarisedBase
      ? [...summarisedBase, ...loopMessages]
      : messages
    const trimmedMessages = truncateOpenAIMessages(effectiveMessages, model)
    console.log(`[api] ~${estimateTokens(...trimmedMessages)} input tokens → ${model}`)

    let stream: Awaited<ReturnType<typeof openai.chat.completions.create>>
    try {
      stream = await openai.chat.completions.create(
        { model, messages: trimmedMessages, ...(openaiTools.length > 0 && { tools: openaiTools }), stream: true },
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

    toolTurns++
    if (toolTurns >= MAX_TOOL_TURNS) {
      allBlocks.push({ type: 'text', text: '\n\n[Stopped: reached maximum tool iterations]' })
      sendChunk({ type: 'text_delta', text: '\n\n[Stopped: reached maximum tool iterations]' })
      break
    }

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
      const result = await executeTool(tc.function.name, input, openaiApiKey)

      allBlocks.push({ type: 'tool_use', id: tc.id, name: tc.function.name, input })
      if (result.type === 'image') {
        allBlocks.push({ type: 'image', mediaType: result.mediaType, data: result.data })
        sendChunk({ type: 'image_block', imageData: result.data, imageMediaType: result.mediaType })
        const successText = 'Image generated successfully.'
        allBlocks.push({ type: 'tool_result', tool_use_id: tc.id, content: successText })
        sendChunk({ type: 'tool_result', toolUseId: tc.id, content: successText })
        messages.push({ role: 'tool', tool_call_id: tc.id, content: successText })
      } else {
        const content = result.content.length > MAX_TOOL_RESULT_CHARS
          ? result.content.slice(0, MAX_TOOL_RESULT_CHARS) + '\n\n[Result truncated]'
          : result.content
        allBlocks.push({ type: 'tool_result', tool_use_id: tc.id, content })
        sendChunk({ type: 'tool_result', toolUseId: tc.id, content })
        messages.push({ role: 'tool', tool_call_id: tc.id, content })
      }
    }
  }

  return makePartialMessage()
}

// ── Available tools helper ───────────────────────────────────────────────────

export function getAvailableTools(settings: Settings): ToolDefinition[] {
  return [
    ...TOOLS.filter((t) => t.name !== 'generate_image' || !!settings.openaiApiKey),
    ...mcpManager.getToolDefinitions()
  ]
}
