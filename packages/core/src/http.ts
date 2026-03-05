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
  }): Promise<{ data?: Array<{ b64_json?: string }> }>
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
    async generateImage(params) {
      return (client.images.generate as (p: unknown) => Promise<{ data?: Array<{ b64_json?: string }> }>)(params)
    }
  }
}

// ── Fetch-based implementations (for mobile — no SDK dependency) ────────────
// Uses XHR with SSE parsing for true streaming on React Native.
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
 * XHR-based SSE stream. Works in React Native where fetch lacks ReadableStream.
 * Returns an async iterable of parsed SSE events plus a promise for completion.
 */
function xhrSSEStream<T>(
  url: string,
  headers: Record<string, string>,
  body: string,
  signal?: AbortSignal
): { events: AsyncIterable<T>; done: Promise<void> } {
  const eventQueue: T[] = []
  type Resolver = (value: IteratorResult<T>) => void
  let waiting: Resolver | null = null
  let finished = false
  let error: Error | null = null

  const donePromise = new Promise<void>((resolveDone, rejectDone) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', url, true)
    for (const [k, v] of Object.entries(headers)) {
      xhr.setRequestHeader(k, v)
    }
    xhr.responseType = 'text'

    let processedIndex = 0
    let sseBuffer = ''

    const pushEvent = (ev: T): void => {
      if (waiting) {
        const r = waiting
        waiting = null
        r({ value: ev, done: false })
      } else {
        eventQueue.push(ev)
      }
    }

    xhr.onprogress = () => {
      const newText = xhr.responseText.slice(processedIndex)
      processedIndex = xhr.responseText.length
      sseBuffer += newText

      const [parsed, remainder] = parseSSEBuffer(sseBuffer)
      sseBuffer = remainder

      for (const ev of parsed) {
        pushEvent(ev as T)
      }
    }

    xhr.onload = () => {
      // Process any remaining buffer
      if (sseBuffer.trim()) {
        const [parsed] = parseSSEBuffer(sseBuffer + '\n\n')
        for (const ev of parsed) {
          pushEvent(ev as T)
        }
      }

      if (xhr.status >= 400) {
        // Try to extract error from non-SSE response
        error = new Error(`API error ${xhr.status}: ${xhr.responseText.slice(0, 500)}`)
        finished = true
        if (waiting) {
          const r = waiting
          waiting = null
          r({ value: undefined as unknown as T, done: true })
        }
        rejectDone(error)
        return
      }

      finished = true
      if (waiting) {
        const r = waiting
        waiting = null
        r({ value: undefined as unknown as T, done: true })
      }
      resolveDone()
    }

    xhr.onerror = () => {
      error = new Error('Network error')
      finished = true
      if (waiting) {
        const r = waiting
        waiting = null
        r({ value: undefined as unknown as T, done: true })
      }
      rejectDone(error)
    }

    xhr.ontimeout = () => {
      error = new Error('Request timeout')
      finished = true
      if (waiting) {
        const r = waiting
        waiting = null
        r({ value: undefined as unknown as T, done: true })
      }
      rejectDone(error)
    }

    if (signal) {
      signal.addEventListener('abort', () => {
        xhr.abort()
        error = new Error('AbortError')
        ;(error as Error & { name: string }).name = 'AbortError'
        finished = true
        if (waiting) {
          const r = waiting
          waiting = null
          r({ value: undefined as unknown as T, done: true })
        }
        rejectDone(error)
      })
    }

    xhr.send(body)
  })

  const events: AsyncIterable<T> = {
    [Symbol.asyncIterator]() {
      return {
        async next(): Promise<IteratorResult<T>> {
          if (eventQueue.length > 0) {
            return { value: eventQueue.shift()!, done: false }
          }
          if (finished) {
            if (error) throw error
            return { value: undefined as unknown as T, done: true }
          }
          return new Promise<IteratorResult<T>>((resolve) => {
            waiting = resolve
          })
        }
      }
    }
  }

  return { events, done: donePromise }
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

      const { events, done } = xhrSSEStream<AnthropicStreamEvent>(
        'https://api.anthropic.com/v1/messages',
        headers,
        JSON.stringify(body),
        signal
      )

      // Collect content blocks for finalMessage()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const contentBlocks: any[] = []
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let currentBlock: any = null
      let stopReason = 'end_turn'

      // Wrap the event iterator to also collect content for finalMessage
      const wrappedEvents: AsyncIterable<AnthropicStreamEvent> = {
        [Symbol.asyncIterator]() {
          const inner = events[Symbol.asyncIterator]()
          return {
            async next(): Promise<IteratorResult<AnthropicStreamEvent>> {
              const result = await inner.next()
              if (!result.done) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const ev = result.value as any
                if (ev.type === 'content_block_start') {
                  currentBlock = { ...ev.content_block }
                  if (currentBlock.type === 'text') currentBlock.text = ''
                  if (currentBlock.type === 'tool_use') currentBlock.input = ''
                  if (currentBlock.type === 'thinking') currentBlock.thinking = ''
                } else if (ev.type === 'content_block_delta') {
                  if (currentBlock) {
                    if (ev.delta?.type === 'text_delta') currentBlock.text = (currentBlock.text ?? '') + (ev.delta.text ?? '')
                    if (ev.delta?.type === 'thinking_delta') currentBlock.thinking = (currentBlock.thinking ?? '') + (ev.delta.thinking ?? '')
                    if (ev.delta?.type === 'input_json_delta') currentBlock.input = (currentBlock.input ?? '') + (ev.delta.partial_json ?? '')
                  }
                } else if (ev.type === 'content_block_stop') {
                  if (currentBlock) {
                    if (currentBlock.type === 'tool_use' && typeof currentBlock.input === 'string') {
                      try { currentBlock.input = JSON.parse(currentBlock.input) } catch { currentBlock.input = {} }
                    }
                    contentBlocks.push(currentBlock)
                    currentBlock = null
                  }
                } else if (ev.type === 'message_delta') {
                  stopReason = ev.delta?.stop_reason ?? stopReason
                }
              }
              return result
            }
          }
        }
      }

      return {
        [Symbol.asyncIterator]() { return wrappedEvents[Symbol.asyncIterator]() },
        async finalMessage(): Promise<{ content: unknown[] }> {
          await done.catch(() => {})
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
      const { events } = xhrSSEStream<OpenAIStreamChunk>(
        `${base}/v1/chat/completions`,
        {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        JSON.stringify(params),
        signal
      )
      return events
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

    async generateImage(params) {
      const response = await fetch(`${base}/v1/images/generations`, {
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
    }
  }
}
