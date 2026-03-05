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
// React Native's XHR corrupts multi-byte UTF-8 (emojis) during incremental reads.
// We use non-streaming fetch + synthesized events. Response appears after generation
// completes but all characters render correctly. Can restore true streaming later
// with a native module or polyfill.

/** Synthesize Anthropic stream events from a complete API response */
function synthesizeAnthropicEvents(response: {
  content: Array<{ type: string; text?: string; id?: string; name?: string; input?: unknown }>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any
}): AnthropicStreamEvent[] {
  const events: AnthropicStreamEvent[] = []
  events.push({ type: 'message_start' } as AnthropicStreamEvent)

  for (let i = 0; i < response.content.length; i++) {
    const block = response.content[i]
    events.push({
      type: 'content_block_start',
      content_block: { type: block.type, id: block.id, name: block.name }
    })

    if (block.type === 'text' && block.text) {
      events.push({
        type: 'content_block_delta',
        delta: { type: 'text_delta', text: block.text }
      })
    } else if (block.type === 'tool_use' && block.input) {
      events.push({
        type: 'content_block_delta',
        delta: { type: 'input_json_delta', partial_json: JSON.stringify(block.input) }
      })
    }

    events.push({ type: 'content_block_stop' })
  }

  events.push({
    type: 'message_delta',
    delta: { stop_reason: response.stop_reason ?? 'end_turn' }
  } as AnthropicStreamEvent)

  return events
}

export function createFetchAnthropicCaller(apiKey: string): AnthropicCaller {
  return {
    streamMessage(params: AnthropicStreamParams, signal?: AbortSignal) {
      const eventQueue: AnthropicStreamEvent[] = []
      type StreamResolver = (value: IteratorResult<AnthropicStreamEvent>) => void
      let resolveStream: StreamResolver | null = null
      let streamDone = false
      let streamError: Error | null = null
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let fullResponse: any = null

      const body: Record<string, unknown> = {
        model: params.model,
        max_tokens: params.max_tokens,
        messages: params.messages
        // Note: NOT setting stream: true — we get the complete response
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

      const fetchPromise = (async () => {
        try {
          const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers,
            body: JSON.stringify(body),
            signal
          })

          if (!response.ok) {
            const text = await response.text()
            throw new Error(`Anthropic API error ${response.status}: ${text}`)
          }

          fullResponse = await response.json()
          console.log('[api] Anthropic response received:', fullResponse.content?.length, 'content blocks, stop_reason:', fullResponse.stop_reason)
          const events = synthesizeAnthropicEvents(fullResponse)

          for (const event of events) {
            eventQueue.push(event)
            if (resolveStream) {
              const r = resolveStream
              resolveStream = null
              r({ value: eventQueue.shift()!, done: false })
            }
          }

          streamDone = true
          if (resolveStream) {
            const r = resolveStream
            resolveStream = null
            if (eventQueue.length > 0) {
              r({ value: eventQueue.shift()!, done: false })
            } else {
              r({ value: undefined as unknown as AnthropicStreamEvent, done: true })
            }
          }
        } catch (err) {
          streamDone = true
          streamError = err instanceof Error ? err : new Error(String(err))
          if (resolveStream) {
            const r = resolveStream
            resolveStream = null
            r({ value: undefined as unknown as AnthropicStreamEvent, done: true })
          }
          throw err
        }
      })()

      return {
        [Symbol.asyncIterator]() {
          return {
            async next(): Promise<IteratorResult<AnthropicStreamEvent>> {
              if (eventQueue.length > 0) {
                return { value: eventQueue.shift()!, done: false }
              }
              if (streamDone) {
                if (streamError) throw streamError
                return { value: undefined as unknown as AnthropicStreamEvent, done: true }
              }
              return new Promise<IteratorResult<AnthropicStreamEvent>>((resolve) => {
                resolveStream = resolve
              })
            }
          }
        },
        async finalMessage(): Promise<{ content: unknown[] }> {
          await fetchPromise
          return { content: fullResponse?.content ?? [] }
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
      // Non-streaming: call without stream flag, synthesize a single chunk
      const { stream: _, ...nonStreamParams } = params
      const response = await fetch(`${base}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify(nonStreamParams),
        signal
      })

      if (!response.ok) {
        const text = await response.text()
        throw new Error(`OpenAI API error ${response.status}: ${text}`)
      }

      const data = await response.json()
      const choice = data.choices?.[0]
      const chunks: OpenAIStreamChunk[] = []

      if (choice?.message?.content) {
        chunks.push({
          choices: [{ delta: { content: choice.message.content }, finish_reason: null }]
        })
      }
      if (choice?.message?.tool_calls) {
        for (const tc of choice.message.tool_calls) {
          chunks.push({
            choices: [{
              delta: {
                tool_calls: [{
                  index: tc.index ?? 0,
                  id: tc.id,
                  function: { name: tc.function?.name, arguments: tc.function?.arguments }
                }]
              },
              finish_reason: null
            }]
          })
        }
      }
      chunks.push({
        choices: [{ delta: {}, finish_reason: choice?.finish_reason ?? 'stop' }]
      })

      let idx = 0
      return {
        [Symbol.asyncIterator]() {
          return {
            async next(): Promise<IteratorResult<OpenAIStreamChunk>> {
              if (idx < chunks.length) {
                return { value: chunks[idx++], done: false }
              }
              return { value: undefined as unknown as OpenAIStreamChunk, done: true }
            }
          }
        }
      }
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
