import type Anthropic from '@anthropic-ai/sdk'
import type OpenAI from 'openai'

const MAX_TOOL_RESULT_CHARS = 12_000

/** Rough token estimate: ~4 chars per token for English text. */
export function estimateTokens(...parts: (string | unknown)[]): number {
  let chars = 0
  for (const p of parts) {
    if (typeof p === 'string') {
      chars += p.length
    } else {
      chars += JSON.stringify(p).length
    }
  }
  return Math.ceil(chars / 4)
}

export function getContextLimit(model: string): number {
  if (model.includes('claude-3-5-haiku')) return 200_000
  if (model.includes('claude')) return 200_000
  if (model.includes('gpt-4o')) return 128_000
  if (model.includes('gpt-4')) return 128_000
  return 128_000 // safe default
}

// ── Anthropic message truncation ─────────────────────────────────────────────

function anthropicBlockChars(block: Anthropic.ContentBlockParam | Anthropic.ToolResultBlockParam): number {
  if ('text' in block && typeof block.text === 'string') return block.text.length
  if ('source' in block && typeof block.source === 'object') {
    const src = block.source as { data?: string }
    return src.data?.length ?? 0
  }
  if ('content' in block && typeof block.content === 'string') return block.content.length
  return JSON.stringify(block).length
}

const OLD_TOOL_RESULT_PLACEHOLDER = '[result previously processed]'

function truncateAnthropicBlock(
  block: Anthropic.ContentBlockParam | Anthropic.ToolResultBlockParam,
  opts: { isLastUserImage: boolean; isRecentToolExchange: boolean }
): Anthropic.ContentBlockParam | Anthropic.ToolResultBlockParam {
  // Strip base64 images from everything except the current (last) user message
  if (!opts.isLastUserImage && 'type' in block && block.type === 'image' && 'source' in block) {
    return { type: 'text', text: '[image previously shared]' }
  }

  // Old tool_use blocks: keep just the name, strip the input
  if (!opts.isRecentToolExchange && 'type' in block && block.type === 'tool_use') {
    return { ...block, input: {} }
  }

  // Tool results: gut old ones, cap current ones
  if ('type' in block && block.type === 'tool_result' && 'content' in block && typeof block.content === 'string') {
    if (!opts.isRecentToolExchange) {
      return { ...block, content: OLD_TOOL_RESULT_PLACEHOLDER }
    }
    if (block.content.length > MAX_TOOL_RESULT_CHARS) {
      return { ...block, content: block.content.slice(0, MAX_TOOL_RESULT_CHARS) + '\n\n[truncated]' }
    }
  }

  return block
}

export function truncateAnthropicMessages(
  messages: Anthropic.MessageParam[],
  model: string,
  systemPromptChars: number
): Anthropic.MessageParam[] {
  const contextLimit = getContextLimit(model)
  // Reserve 30% for response + tool defs
  const budget = Math.floor(contextLimit * 0.7)
  const systemTokens = Math.ceil(systemPromptChars / 4)
  let remaining = budget - systemTokens

  if (messages.length === 0) return messages

  // Find the last user message with images — only it keeps base64 data
  let lastUserImageIndex = -1
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') {
      const content = messages[i].content
      if (Array.isArray(content) && content.some((b) => 'type' in b && b.type === 'image')) {
        lastUserImageIndex = i
        break
      }
    }
  }

  // Find the start of the most recent tool exchange: the last assistant message
  // that contains tool_use blocks. Tool results from this exchange onward keep
  // full content; older ones get replaced with a placeholder.
  let recentToolExchangeStart = messages.length // default: nothing is "recent"
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'assistant') {
      const content = messages[i].content
      const hasToolUse = Array.isArray(content) && content.some(
        (b) => 'type' in b && b.type === 'tool_use'
      )
      if (hasToolUse) { recentToolExchangeStart = i; break }
    }
  }

  const processed: Anthropic.MessageParam[] = messages.map((msg, i) => {
    if (typeof msg.content === 'string') return msg
    const content = (msg.content as (Anthropic.ContentBlockParam | Anthropic.ToolResultBlockParam)[]).map(
      (block) => truncateAnthropicBlock(block, {
        isLastUserImage: i === lastUserImageIndex,
        isRecentToolExchange: i >= recentToolExchangeStart
      })
    )
    return { ...msg, content }
  })

  // Estimate size of each message
  const sizes = processed.map((msg) => {
    if (typeof msg.content === 'string') return Math.ceil(msg.content.length / 4)
    return Math.ceil(
      (msg.content as (Anthropic.ContentBlockParam | Anthropic.ToolResultBlockParam)[])
        .reduce((sum, b) => sum + anthropicBlockChars(b), 0) / 4
    )
  })

  // Walk from newest to oldest, keeping messages that fit
  const keep = new Array<boolean>(processed.length).fill(false)

  // Always try to keep the first message (initial context)
  // Always keep the most recent messages
  for (let i = processed.length - 1; i >= 0; i--) {
    if (remaining >= sizes[i]) {
      remaining -= sizes[i]
      keep[i] = true
    } else if (i === 0 && remaining > 0) {
      // Keep first message even if it doesn't fully fit (it provides context)
      keep[i] = true
    }
  }

  const result = processed.filter((_, i) => keep[i])

  // Ensure we didn't produce invalid turn structure (must start with user)
  if (result.length > 0 && result[0].role !== 'user') {
    // Prepend a synthetic user message
    result.unshift({ role: 'user', content: '[earlier conversation history truncated]' })
  }

  return result
}

// ── OpenAI message truncation ────────────────────────────────────────────────

function openaiMessageChars(msg: OpenAI.ChatCompletionMessageParam): number {
  if ('content' in msg) {
    if (typeof msg.content === 'string') return msg.content.length
    if (Array.isArray(msg.content)) {
      return msg.content.reduce((sum, part) => {
        if ('text' in part) return sum + part.text.length
        if ('image_url' in part) return sum + (part.image_url.url?.length ?? 0)
        return sum + JSON.stringify(part).length
      }, 0)
    }
  }
  return JSON.stringify(msg).length
}

function truncateOpenAIMessage(
  msg: OpenAI.ChatCompletionMessageParam,
  opts: { isLastUserImage: boolean; isRecentToolExchange: boolean }
): OpenAI.ChatCompletionMessageParam {
  // Strip base64 images from everything except the current (last) user message with images
  if (!opts.isLastUserImage && msg.role === 'user' && Array.isArray(msg.content)) {
    const content = msg.content.map((part) => {
      if ('image_url' in part && part.image_url.url?.startsWith('data:')) {
        return { type: 'text' as const, text: '[image previously shared]' }
      }
      return part
    }) as OpenAI.ChatCompletionContentPart[]
    return { ...msg, content }
  }

  // Tool results: gut old ones, cap current ones
  if (msg.role === 'tool' && typeof msg.content === 'string') {
    if (!opts.isRecentToolExchange) {
      return { ...msg, content: OLD_TOOL_RESULT_PLACEHOLDER }
    }
    if (msg.content.length > MAX_TOOL_RESULT_CHARS) {
      return { ...msg, content: msg.content.slice(0, MAX_TOOL_RESULT_CHARS) + '\n\n[truncated]' }
    }
  }

  return msg
}

export function truncateOpenAIMessages(
  messages: OpenAI.ChatCompletionMessageParam[],
  model: string
): OpenAI.ChatCompletionMessageParam[] {
  const contextLimit = getContextLimit(model)
  const budget = Math.floor(contextLimit * 0.7)
  let remaining = budget

  if (messages.length === 0) return messages

  // Separate system messages (always kept) from conversation messages
  const systemMsgs = messages.filter((m) => m.role === 'system')
  const convMsgs = messages.filter((m) => m.role !== 'system')

  for (const sm of systemMsgs) {
    remaining -= Math.ceil(openaiMessageChars(sm) / 4)
  }

  let lastUserImageIndex = -1
  for (let i = convMsgs.length - 1; i >= 0; i--) {
    if (convMsgs[i].role === 'user' && Array.isArray(convMsgs[i].content) &&
        (convMsgs[i].content as OpenAI.ChatCompletionContentPart[]).some(
          (p) => 'image_url' in p
        )) {
      lastUserImageIndex = i
      break
    }
  }

  let recentToolExchangeStart = convMsgs.length
  for (let i = convMsgs.length - 1; i >= 0; i--) {
    if (convMsgs[i].role === 'assistant' && 'tool_calls' in convMsgs[i]) {
      recentToolExchangeStart = i
      break
    }
  }

  const processed = convMsgs.map((msg, i) => truncateOpenAIMessage(msg, {
    isLastUserImage: i === lastUserImageIndex,
    isRecentToolExchange: i >= recentToolExchangeStart
  }))

  const sizes = processed.map((msg) => Math.ceil(openaiMessageChars(msg) / 4))

  const keep = new Array<boolean>(processed.length).fill(false)

  for (let i = processed.length - 1; i >= 0; i--) {
    if (remaining >= sizes[i]) {
      remaining -= sizes[i]
      keep[i] = true
    } else if (i === 0 && remaining > 0) {
      keep[i] = true
    }
  }

  return [...systemMsgs, ...processed.filter((_, i) => keep[i])]
}
