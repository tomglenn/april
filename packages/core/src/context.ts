import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'

const MAX_TOOL_RESULT_CHARS = 12_000

function getContextThresholds(recentExchanges: number) {
  const recentMessageWindow = recentExchanges * 2
  const minMessagesToSummarise = recentMessageWindow + 4
  const resummariseThreshold = recentMessageWindow * 2
  return { recentMessageWindow, minMessagesToSummarise, resummariseThreshold }
}

// ── Summary cache (process-lifetime) ─────────────────────────────────────────

const summaryCache = new Map<string, {
  messageCount: number
  summary: string
  summarisedUpTo: number // index into original messages array — everything before this is in the summary
  recentExchanges: number
}>()

const SUMMARISE_PROMPT = `Summarise this conversation history concisely. Include:
- What the user asked for or is working on
- Key decisions, outcomes, or facts established
- Any ongoing context needed for future messages
- The tone and personality the assistant has been using (e.g. casual, warm, playful, formal) so it can maintain consistency
Keep it to 3-5 sentences. Do not include greetings or filler.`

const INCREMENTAL_PROMPT = `You previously summarised a conversation. Here is your previous summary, followed by new messages to incorporate. Produce an updated summary (3-5 sentences) that covers everything.

Previous summary:
{previous_summary}

New messages to incorporate:
{new_messages}

Updated summary:`

async function callHaikuForSummary(prompt: string, messages: string, apiKey: string): Promise<string> {
  const anthropic = new Anthropic({ apiKey })
  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 300,
    messages: [{ role: 'user', content: prompt + '\n\n' + messages }]
  })
  const textBlock = response.content.find((b) => b.type === 'text')
  return textBlock ? (textBlock as Anthropic.TextBlock).text.trim() : ''
}

function anthropicMessagesToText(messages: Anthropic.MessageParam[]): string {
  return messages.map((msg) => {
    const role = msg.role
    if (typeof msg.content === 'string') return `${role}: ${msg.content}`
    const parts = (msg.content as Anthropic.ContentBlockParam[]).map((block) => {
      if ('text' in block && typeof block.text === 'string') return block.text
      if ('type' in block && block.type === 'tool_use') return `[tool: ${(block as { name: string }).name}]`
      if ('type' in block && block.type === 'tool_result') return '[tool result]'
      return ''
    }).filter(Boolean)
    return `${role}: ${parts.join(' ')}`
  }).join('\n')
}

function openaiMessagesToText(messages: OpenAI.ChatCompletionMessageParam[]): string {
  return messages.map((msg) => {
    const role = msg.role
    if ('content' in msg && typeof msg.content === 'string') return `${role}: ${msg.content}`
    if ('content' in msg && Array.isArray(msg.content)) {
      const text = msg.content.map((p) => ('text' in p ? p.text : '')).filter(Boolean).join(' ')
      return `${role}: ${text}`
    }
    return `${role}: [message]`
  }).join('\n')
}

function makeSummaryMessage(summaryText: string): Anthropic.MessageParam {
  return {
    role: 'user',
    content: `[Conversation summary]\n${summaryText}\n[End summary — continue in the same tone and style as described above]`
  }
}

export async function summariseAnthropicMessages(
  conversationId: string,
  messages: Anthropic.MessageParam[],
  apiKey: string,
  recentExchanges = 8
): Promise<Anthropic.MessageParam[] | null> {
  const { recentMessageWindow, minMessagesToSummarise, resummariseThreshold } = getContextThresholds(recentExchanges)

  if (messages.length < minMessagesToSummarise + recentMessageWindow) return null

  const recentStart = messages.length - recentMessageWindow
  const recentMessages = messages.slice(recentStart)

  const cached = summaryCache.get(conversationId)

  // Invalidate cache if recentExchanges setting changed
  if (cached && cached.recentExchanges !== recentExchanges) {
    summaryCache.delete(conversationId)
  }

  const validCached = summaryCache.get(conversationId)

  // Cache hit: exact message count match (handles agentic loop — no work needed)
  if (validCached && validCached.messageCount === messages.length) {
    const buffer = messages.slice(validCached.summarisedUpTo, recentStart)
    return [makeSummaryMessage(validCached.summary), ...buffer, ...recentMessages]
  }

  // Existing summary: check if buffer has grown past threshold
  if (validCached && validCached.summary) {
    const buffer = messages.slice(validCached.summarisedUpTo, recentStart)

    if (buffer.length < resummariseThreshold) {
      // Buffer small enough — keep in full, no Haiku call
      summaryCache.set(conversationId, { ...validCached, messageCount: messages.length })
      return [makeSummaryMessage(validCached.summary), ...buffer, ...recentMessages]
    }

    // Buffer too large — re-summarise
    try {
      const bufferText = anthropicMessagesToText(buffer)
      const prompt = INCREMENTAL_PROMPT
        .replace('{previous_summary}', validCached.summary)
        .replace('{new_messages}', bufferText)
      const summaryText = await callHaikuForSummary(prompt, '', apiKey)
      if (!summaryText) return null

      summaryCache.set(conversationId, { messageCount: messages.length, summary: summaryText, summarisedUpTo: recentStart, recentExchanges })
      console.log(`[summary] Re-summarised for ${conversationId} (buffer of ${buffer.length} messages → ~${estimateTokens(summaryText)} tokens)`)
      return [makeSummaryMessage(summaryText), ...recentMessages]
    } catch (err) {
      console.warn('[summary] Failed to re-summarise, keeping buffer:', err)
      summaryCache.set(conversationId, { ...validCached, messageCount: messages.length })
      return [makeSummaryMessage(validCached.summary), ...buffer, ...recentMessages]
    }
  }

  // No cached summary: full summarisation from scratch
  const oldMessages = messages.slice(0, recentStart)
  try {
    const oldText = anthropicMessagesToText(oldMessages)
    const summaryText = await callHaikuForSummary(SUMMARISE_PROMPT, oldText, apiKey)
    if (!summaryText) return null

    summaryCache.set(conversationId, { messageCount: messages.length, summary: summaryText, summarisedUpTo: recentStart, recentExchanges })
    console.log(`[summary] Generated summary for ${conversationId} (${oldMessages.length} old messages → ~${estimateTokens(summaryText)} tokens)`)
    return [makeSummaryMessage(summaryText), ...recentMessages]
  } catch (err) {
    console.warn('[summary] Failed to generate summary:', err)
    return null
  }
}

export async function summariseOpenAIMessages(
  conversationId: string,
  messages: OpenAI.ChatCompletionMessageParam[],
  apiKey: string | undefined,
  provider: 'openai' | 'ollama',
  recentExchanges = 8
): Promise<OpenAI.ChatCompletionMessageParam[] | null> {
  // Skip summarisation for Ollama — no cheap model available
  if (provider === 'ollama' || !apiKey) return null

  const { recentMessageWindow, minMessagesToSummarise, resummariseThreshold } = getContextThresholds(recentExchanges)

  // Separate system messages from conversation messages for counting
  const systemMsgs = messages.filter((m) => m.role === 'system')
  const convMsgs = messages.filter((m) => m.role !== 'system')

  if (convMsgs.length < minMessagesToSummarise + recentMessageWindow) return null

  const recentStart = convMsgs.length - recentMessageWindow
  const recentMessages = convMsgs.slice(recentStart)

  const makeOpenAISummaryMsg = (text: string): OpenAI.ChatCompletionMessageParam => ({
    role: 'user',
    content: `[Conversation summary]\n${text}\n[End summary — continue in the same tone and style as described above]`
  })

  const cached = summaryCache.get(conversationId)

  // Invalidate cache if recentExchanges setting changed
  if (cached && cached.recentExchanges !== recentExchanges) {
    summaryCache.delete(conversationId)
  }

  const validCached = summaryCache.get(conversationId)

  // Cache hit: exact message count match (handles agentic loop)
  if (validCached && validCached.messageCount === messages.length) {
    const buffer = convMsgs.slice(validCached.summarisedUpTo, recentStart)
    return [...systemMsgs, makeOpenAISummaryMsg(validCached.summary), ...buffer, ...recentMessages]
  }

  // Existing summary: check if buffer has grown past threshold
  if (validCached && validCached.summary) {
    const buffer = convMsgs.slice(validCached.summarisedUpTo, recentStart)

    if (buffer.length < resummariseThreshold) {
      summaryCache.set(conversationId, { ...validCached, messageCount: messages.length })
      return [...systemMsgs, makeOpenAISummaryMsg(validCached.summary), ...buffer, ...recentMessages]
    }

    // Buffer too large — re-summarise
    try {
      const openai = new OpenAI({ apiKey })
      const bufferText = openaiMessagesToText(buffer)
      const prompt = INCREMENTAL_PROMPT
        .replace('{previous_summary}', validCached.summary)
        .replace('{new_messages}', bufferText)
      const resp = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        max_tokens: 300,
        messages: [{ role: 'user', content: prompt }]
      })
      const summaryText = resp.choices[0]?.message?.content?.trim() ?? ''
      if (!summaryText) return null

      summaryCache.set(conversationId, { messageCount: messages.length, summary: summaryText, summarisedUpTo: recentStart, recentExchanges })
      console.log(`[summary] Re-summarised OpenAI for ${conversationId} (buffer of ${buffer.length} messages → ~${estimateTokens(summaryText)} tokens)`)
      return [...systemMsgs, makeOpenAISummaryMsg(summaryText), ...recentMessages]
    } catch (err) {
      console.warn('[summary] Failed to re-summarise OpenAI, keeping buffer:', err)
      summaryCache.set(conversationId, { ...validCached, messageCount: messages.length })
      return [...systemMsgs, makeOpenAISummaryMsg(validCached.summary), ...buffer, ...recentMessages]
    }
  }

  // No cached summary: full summarisation from scratch
  const oldMessages = convMsgs.slice(0, recentStart)
  try {
    const openai = new OpenAI({ apiKey })
    const oldText = openaiMessagesToText(oldMessages)
    const resp = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 300,
      messages: [{ role: 'user', content: SUMMARISE_PROMPT + '\n\n' + oldText }]
    })
    const summaryText = resp.choices[0]?.message?.content?.trim() ?? ''
    if (!summaryText) return null

    summaryCache.set(conversationId, { messageCount: messages.length, summary: summaryText, summarisedUpTo: recentStart, recentExchanges })
    console.log(`[summary] Generated OpenAI summary for ${conversationId} (${oldMessages.length} old messages → ~${estimateTokens(summaryText)} tokens)`)
    return [...systemMsgs, makeOpenAISummaryMsg(summaryText), ...recentMessages]
  } catch (err) {
    console.warn('[summary] Failed to generate OpenAI summary:', err)
    return null
  }
}

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
