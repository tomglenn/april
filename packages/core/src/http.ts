// ── Abstract API caller interfaces ──────────────────────────────────────────
// Both SDK-based and fetch-based callers implement these interfaces.
// This allows core chat/context logic to work with any HTTP mechanism.

// ── Anthropic types ─────────────────────────────────────────────────────────

export interface AnthropicStreamParams {
  model: string
  max_tokens: number
  system?: unknown
  tools?: unknown[]
  messages: unknown[]
  thinking?: { type: string; budget_tokens: number }
  betas?: string[]
}

export interface AnthropicCreateParams {
  model: string
  max_tokens: number
  messages: unknown[]
}

export interface AnthropicResponse {
  content: Array<{ type: string; text?: string }>
}

export interface AnthropicStreamEvent {
  type: string
  content_block?: { type: string; id?: string; name?: string }
  delta?: {
    type?: string
    text?: string
    thinking?: string
    partial_json?: string
    stop_reason?: string
  }
}

export interface AnthropicCaller {
  streamMessage(params: AnthropicStreamParams, signal?: AbortSignal): AsyncIterable<AnthropicStreamEvent> & {
    finalMessage(): Promise<{ content: unknown[] }>
  }
  createMessage(params: AnthropicCreateParams): Promise<AnthropicResponse>
}

// ── OpenAI types ────────────────────────────────────────────────────────────

export interface OpenAIStreamParams {
  model: string
  messages: unknown[]
  tools?: unknown[]
  stream: true
  max_tokens?: number
}

export interface OpenAICreateParams {
  model: string
  messages: unknown[]
  max_tokens?: number
}

export interface OpenAIStreamChunk {
  choices: Array<{
    delta: {
      content?: string
      tool_calls?: Array<{
        index: number
        id?: string
        function?: { name?: string; arguments?: string }
      }>
    }
    finish_reason?: string | null
  }>
}

export interface OpenAICreateResponse {
  choices: Array<{
    message: { content?: string | null }
  }>
}

export interface OpenAICaller {
  streamChat(params: OpenAIStreamParams, signal?: AbortSignal): Promise<AsyncIterable<OpenAIStreamChunk>>
  createChat(params: OpenAICreateParams): Promise<OpenAICreateResponse>
  generateImage(params: {
    model: string
    prompt: string
    n: number
    size: string
    quality: string
    background: string
    output_format: string
  }, signal?: AbortSignal): Promise<{ data?: Array<{ b64_json?: string }> }>
}

// ── SDK-based implementations (for desktop — wraps existing SDK instances) ──

export function createSDKAnthropicCaller(apiKey: string): AnthropicCaller {
  // Lazy import to avoid bundling SDK where not needed
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Anthropic = require('@anthropic-ai/sdk').default
  const client = new Anthropic({ apiKey })

  return {
    streamMessage(params: AnthropicStreamParams, signal?: AbortSignal) {
      const stream = client.messages.stream(params, { signal })
      // The SDK stream is already an AsyncIterable and has finalMessage()
      return stream
    },
    async createMessage(params: AnthropicCreateParams): Promise<AnthropicResponse> {
      return client.messages.create(params)
    }
  }
}

export function createSDKOpenAICaller(apiKey: string, baseURL?: string): OpenAICaller {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const OpenAI = require('openai').default
  const client = new OpenAI({ apiKey, baseURL })

  return {
    async streamChat(params: OpenAIStreamParams, signal?: AbortSignal) {
      return client.chat.completions.create(params, { signal })
    },
    async createChat(params: OpenAICreateParams): Promise<OpenAICreateResponse> {
      return client.chat.completions.create(params)
    },
    async generateImage(params, signal?: AbortSignal) {
      return (client.images.generate as (p: unknown, opts?: unknown) => Promise<{ data?: Array<{ b64_json?: string }> }>)(params, { signal })
    }
  }
}

// ── Fetch-based implementations (for mobile — no SDK dependency) ────────────
// Uses fetch() + ReadableStream for true incremental SSE streaming on React Native.
// React Native 0.72+ supports response.body.getReader(), which delivers chunks as they
// arrive from the network — unlike XHR onprogress which iOS can buffer on cellular.
// Only processes complete SSE lines to avoid UTF-8 corruption at byte boundaries.

/** Parse SSE lines from a text buffer. Returns [parsed events, remaining buffer]. */
function parseSSEBuffer(buffer: string): [Array<Record<string, unknown>>, string] {
  const events: Array<Record<string, unknown>> = []
  const blocks = buffer.split('\n\n')
  // Last element may be incomplete — keep it as remainder
  const remainder = blocks.pop() ?? ''

  for (const block of blocks) {
    const lines = block.split('\n')
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6)
        if (data === '[DONE]') continue
        try {
          events.push(JSON.parse(data))
        } catch { /* skip malformed */ }
      }
    }
  }

  return [events, remainder]
}

/**
 * Fetch-based SSE stream using ReadableStream for incremental delivery.
 * Falls back to full-response parsing if response.body is unavailable.
 */
async function* fetchSSEStream<T>(
  url: string,
  headers: Record<string, string>,
  body: string,
  signal?: AbortSignal
): AsyncGenerator<T> {
  const response = await fetch(url, { method: 'POST', headers, body, signal })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`API error ${response.status}: ${text.slice(0, 500)}`)
  }

  if (!response.body) {
    // Fallback for environments without ReadableStream
    const text = await response.text()
    const [parsed] = parseSSEBuffer(text + '\n\n')
    for (const ev of parsed) yield ev as T
    return
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let sseBuffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      sseBuffer += decoder.decode(value, { stream: true })
      const [parsed, remainder] = parseSSEBuffer(sseBuffer)
      sseBuffer = remainder
      for (const ev of parsed) yield ev as T
    }
    // Flush any trailing partial line
    if (sseBuffer.trim()) {
      const [parsed] = parseSSEBuffer(sseBuffer + '\n\n')
      for (const ev of parsed) yield ev as T
    }
  } finally {
    reader.releaseLock()
  }
}

export function createFetchAnthropicCaller(apiKey: string): AnthropicCaller {
  return {
    streamMessage(params: AnthropicStreamParams, signal?: AbortSignal) {
      const body: Record<string, unknown> = {
        model: params.model,
        max_tokens: params.max_tokens,
        messages: params.messages,
        stream: true
      }
      if (params.system) body.system = params.system
      if (params.tools && params.tools.length > 0) body.tools = params.tools
      if (params.thinking) body.thinking = params.thinking

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      }
      if (params.betas && params.betas.length > 0) {
        headers['anthropic-beta'] = params.betas.join(',')
      }

      // Collect content blocks for finalMessage() as events flow through
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const contentBlocks: any[] = []
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let currentBlock: any = null
      let stopReason = 'end_turn'

      async function* wrappedStream(): AsyncGenerator<AnthropicStreamEvent> {
        const source = fetchSSEStream<AnthropicStreamEvent>(
          'https://api.anthropic.com/v1/messages',
          headers,
          JSON.stringify(body),
          signal
        )
        for await (const ev of source) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const event = ev as any
          if (event.type === 'content_block_start') {
            currentBlock = { ...event.content_block }
            if (currentBlock.type === 'text') currentBlock.text = ''
            if (currentBlock.type === 'tool_use') currentBlock.input = ''
            if (currentBlock.type === 'thinking') currentBlock.thinking = ''
          } else if (event.type === 'content_block_delta') {
            if (currentBlock) {
              if (event.delta?.type === 'text_delta') currentBlock.text = (currentBlock.text ?? '') + (event.delta.text ?? '')
              if (event.delta?.type === 'thinking_delta') currentBlock.thinking = (currentBlock.thinking ?? '') + (event.delta.thinking ?? '')
              if (event.delta?.type === 'input_json_delta') currentBlock.input = (currentBlock.input ?? '') + (event.delta.partial_json ?? '')
            }
          } else if (event.type === 'content_block_stop') {
            if (currentBlock) {
              if (currentBlock.type === 'tool_use' && typeof currentBlock.input === 'string') {
                try { currentBlock.input = JSON.parse(currentBlock.input) } catch { currentBlock.input = {} }
              }
              contentBlocks.push(currentBlock)
              currentBlock = null
            }
          } else if (event.type === 'message_delta') {
            stopReason = event.delta?.stop_reason ?? stopReason
          }
          yield ev
        }
      }

      const gen = wrappedStream()
      return {
        [Symbol.asyncIterator]() { return gen },
        async finalMessage(): Promise<{ content: unknown[] }> {
          // By the time this is called the for-await loop has consumed the generator;
          // contentBlocks and stopReason are already fully populated.
          return { content: contentBlocks, stop_reason: stopReason } as { content: unknown[] }
        }
      }
    },

    async createMessage(params: AnthropicCreateParams): Promise<AnthropicResponse> {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: params.model,
          max_tokens: params.max_tokens,
          messages: params.messages
        })
      })

      if (!response.ok) {
        const text = await response.text()
        throw new Error(`Anthropic API error ${response.status}: ${text}`)
      }

      return response.json()
    }
  }
}

export function createFetchOpenAICaller(apiKey: string, baseURL?: string): OpenAICaller {
  const base = (baseURL ?? 'https://api.openai.com').replace(/\/$/, '')

  return {
    async streamChat(params: OpenAIStreamParams, signal?: AbortSignal): Promise<AsyncIterable<OpenAIStreamChunk>> {
      return fetchSSEStream<OpenAIStreamChunk>(
        `${base}/v1/chat/completions`,
        {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        JSON.stringify(params),
        signal
      )
    },

    async createChat(params: OpenAICreateParams): Promise<OpenAICreateResponse> {
      const response = await fetch(`${base}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify(params)
      })

      if (!response.ok) {
        const text = await response.text()
        throw new Error(`OpenAI API error ${response.status}: ${text}`)
      }

      return response.json()
    },

    async generateImage(params, signal?: AbortSignal) {
      const response = await fetch(`${base}/v1/images/generations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify(params),
        signal
      })

      if (!response.ok) {
        const text = await response.text()
        throw new Error(`OpenAI API error ${response.status}: ${text}`)
      }

      return response.json()
    }
  }
}
