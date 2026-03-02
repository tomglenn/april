import { useState, useEffect, useRef, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import rehypeHighlight from 'rehype-highlight'
import remarkGfm from 'remark-gfm'
import { Send, RotateCcw, ExternalLink, X } from 'lucide-react'
import type { Message, ContentBlock, Settings } from './types'
import type { ChunkData } from './types'

const CONV_ID = '__quick_prompt__'

export function OverlayApp(): JSX.Element {
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [streamingBlocks, setStreamingBlocks] = useState<ContentBlock[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [settings, setSettings] = useState<Settings | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Load settings + set overlay-mode class
  useEffect(() => {
    document.body.classList.add('overlay-mode')
    window.api.getSettings().then(setSettings).catch(() => {})
  }, [])

  // Auto-focus input on mount and when streaming finishes
  useEffect(() => {
    if (!isStreaming) inputRef.current?.focus()
  }, [isStreaming])

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, streamingBlocks])

  const messagesRef = useRef(messages)
  messagesRef.current = messages

  // Generation counter — bumped on reset so in-flight sends discard their results
  const generationRef = useRef(0)
  // Keep a ref to the active chunk handler so reset can unregister it
  const activeChunkHandlerRef = useRef<((data: ChunkData) => void) | null>(null)
  // When set, chunks are forwarded to the main window for this conversation ID
  const forwardToConvIdRef = useRef<string | null>(null)

  const handleSend = useCallback(async () => {
    const text = input.trim()
    if (!text || isStreaming || !settings) return

    const gen = generationRef.current

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      blocks: [{ type: 'text', text }],
      timestamp: Date.now()
    }

    setMessages((prev) => [...prev, userMsg])
    setInput('')
    setIsStreaming(true)
    setStreamingBlocks([])

    let currentBlocks: ContentBlock[] = []
    let currentTextIdx = -1

    const handleChunk = (data: ChunkData): void => {
      if (data.conversationId && data.conversationId !== CONV_ID) return

      // Forward to main window if handoff is active (before generation check
      // so forwarding survives even after overlay UI is reset)
      const forwardId = forwardToConvIdRef.current
      if (forwardId) {
        window.api.forwardChunk({ ...data, conversationId: forwardId })
        return
      }

      if (generationRef.current !== gen) return

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
        setStreamingBlocks([...currentBlocks])
      } else if (data.type === 'done' || data.type === 'aborted') {
        setStreamingBlocks([])
      } else if (data.type === 'error') {
        setStreamingBlocks([])
      }
    }

    activeChunkHandlerRef.current = handleChunk
    window.api.onChunk(handleChunk)

    // Build the full message list for the API from the ref (includes the userMsg we just added)
    const apiMessages = [...messagesRef.current, userMsg]

    try {
      const result = await window.api.sendMessage({
        conversationId: CONV_ID,
        messages: apiMessages,
        model: settings.defaultModel,
        provider: settings.defaultProvider,
        enableThinking: false
      })
      if (result && generationRef.current === gen) {
        const forwardId = forwardToConvIdRef.current
        if (forwardId) {
          // Stream finished while forwarding — persist final response to the real conversation
          try {
            const conv = await window.api.getConversation(forwardId)
            if (conv) {
              const lastMsg = conv.messages[conv.messages.length - 1]
              if (lastMsg?.role === 'assistant') {
                lastMsg.blocks = result.blocks
              } else {
                conv.messages.push({ ...result, id: crypto.randomUUID() })
              }
              conv.updatedAt = Date.now()
              await window.api.updateConversation(conv)
            }
          } catch { /* non-critical */ }
          forwardToConvIdRef.current = null
        } else {
          setMessages((prev) => [...prev, { ...result, id: crypto.randomUUID() }])
        }
      }
    } catch {
      if (generationRef.current === gen && !forwardToConvIdRef.current) {
        const errMsg: Message = {
          id: crypto.randomUUID(),
          role: 'assistant',
          blocks: [{ type: 'text', text: 'Something went wrong. Please try again.' }],
          timestamp: Date.now()
        }
        setMessages((prev) => [...prev, errMsg])
      }
      forwardToConvIdRef.current = null
    } finally {
      window.api.offChunk(handleChunk)
      if (activeChunkHandlerRef.current === handleChunk) {
        activeChunkHandlerRef.current = null
      }
      if (generationRef.current === gen) {
        setIsStreaming(false)
        setStreamingBlocks([])
      }
    }
  }, [input, isStreaming, settings])

  const [savedConvId, setSavedConvId] = useState<string | null>(null)

  const handleOpenInApp = useCallback(async () => {
    if (messages.length === 0) return

    // If already saved this conversation, just open it — don't create a duplicate
    if (savedConvId) {
      window.api.openInApp(savedConvId)
      return
    }

    const wasStreaming = isStreaming

    // Snapshot: committed messages + any partial streaming response
    const partialBlocks = streamingBlocks.filter((b) => b.type === 'text')
    const allMessages = partialBlocks.length > 0
      ? [...messages, { id: crypto.randomUUID(), role: 'assistant' as const, blocks: partialBlocks, model: settings?.defaultModel, provider: settings?.defaultProvider, timestamp: Date.now() }]
      : messages

    try {
      const conv = await window.api.createConversation()
      conv.messages = allMessages
      conv.updatedAt = Date.now()
      await window.api.updateConversation(conv)

      // If streaming, set up chunk forwarding so the main window continues receiving
      if (wasStreaming) {
        forwardToConvIdRef.current = conv.id
      }

      // Auto-title in the background
      const firstUserText = messages.find((m) => m.role === 'user')?.blocks
        .filter((b) => b.type === 'text')
        .map((b) => (b as { type: 'text'; text: string }).text)
        .join(' ')
      if (firstUserText && settings) {
        window.api.generateTitle({
          provider: settings.defaultProvider,
          model: settings.defaultModel,
          firstMessage: firstUserText
        }).then((title) => {
          if (title) {
            conv.title = title
            window.api.updateConversation(conv)
          }
        }).catch(() => {})
      }

      window.api.openInApp(conv.id)

      // Reset overlay visual state (stream continues in background for forwarding)
      setMessages([])
      setStreamingBlocks([])
      setIsStreaming(false)
      setInput('')
      setSavedConvId(null)
    } catch {
      // ignore
    }
  }, [messages, streamingBlocks, isStreaming, settings, savedConvId])

  const handleReset = useCallback(() => {
    // Bump generation so the in-flight send discards its results
    generationRef.current += 1
    // Stop forwarding
    forwardToConvIdRef.current = null
    // Unregister the active chunk handler immediately
    if (activeChunkHandlerRef.current) {
      window.api.offChunk(activeChunkHandlerRef.current)
      activeChunkHandlerRef.current = null
    }
    // Abort the API call
    if (isStreaming) {
      window.api.abortMessage(CONV_ID)
    }
    setMessages([])
    setStreamingBlocks([])
    setIsStreaming(false)
    setInput('')
    setSavedConvId(null)
    inputRef.current?.focus()
  }, [isStreaming])

  // Global keyboard shortcuts: Escape, Cmd+O (open in app), Cmd+N (new)
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') { window.close(); return }
      const mod = e.metaKey || e.ctrlKey
      if (!mod) return
      if (e.key === 'o') { e.preventDefault(); handleOpenInApp() }
      if (e.key === 'n') { e.preventDefault(); handleReset() }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [handleOpenInApp, handleReset])

  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const mod = navigator.platform.includes('Mac') ? '\u2318' : 'Ctrl+'

  const streamingText = streamingBlocks
    .filter((b) => b.type === 'text')
    .map((b) => (b as { type: 'text'; text: string }).text)
    .join('')

  return (
    <div className="w-full h-full flex items-start justify-center p-0">
      <div
        className="w-full h-full flex flex-col overflow-hidden"
        style={{
          background: 'rgba(13,13,15,0.92)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderRadius: '16px',
          border: '1px solid rgba(255,255,255,0.08)'
        }}
      >
        {/* Input area */}
        <div className="px-4 pt-4 pb-2 shrink-0">
          <div className="flex gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask anything..."
              rows={1}
              className="flex-1 resize-none px-3 py-2.5 rounded-lg text-sm outline-none"
              style={{
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.1)',
                color: '#e8e8f0',
                maxHeight: '120px',
                fontFamily: 'inherit'
              }}
              onInput={(e) => {
                const el = e.currentTarget
                el.style.height = 'auto'
                el.style.height = Math.min(el.scrollHeight, 120) + 'px'
              }}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || isStreaming}
              className="px-3 rounded-lg transition-opacity disabled:opacity-30"
              style={{ background: 'var(--accent)', color: 'white' }}
            >
              <Send size={16} />
            </button>
          </div>
        </div>

        {/* Response area */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto px-4 py-2 min-h-0"
        >
          {/* Show all user messages + assistant responses */}
          {messages.map((msg) => (
            <div key={msg.id} className="mb-3">
              {msg.role === 'user' ? (
                <div className="text-xs font-medium mb-1" style={{ color: 'var(--muted)' }}>
                  You
                </div>
              ) : (
                <div className="text-xs font-medium mb-1" style={{ color: 'var(--accent)' }}>
                  April
                </div>
              )}
              {msg.blocks
                .filter((b) => b.type === 'text')
                .map((b, i) => (
                  <div key={i}>
                    {msg.role === 'user' ? (
                      <p className="text-sm" style={{ color: '#e8e8f0' }}>
                        {(b as { type: 'text'; text: string }).text}
                      </p>
                    ) : (
                      <div className="prose text-sm" style={{ color: 'var(--text)' }}>
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          rehypePlugins={[rehypeHighlight]}
                          components={{
                            a: ({ href, children, ...props }) => (
                              <a {...props} href={href} target="_blank" rel="noreferrer">{children}</a>
                            )
                          }}
                        >
                          {(b as { type: 'text'; text: string }).text}
                        </ReactMarkdown>
                      </div>
                    )}
                  </div>
                ))}
            </div>
          ))}

          {/* Streaming indicator */}
          {isStreaming && streamingBlocks.length === 0 && (
            <div className="flex items-center gap-2 py-2" style={{ color: 'var(--muted)' }}>
              <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: 'var(--accent)' }} />
              <span className="text-xs">Thinking...</span>
            </div>
          )}

          {/* Streaming text */}
          {isStreaming && streamingText && (
            <div className="mb-3">
              <div className="text-xs font-medium mb-1" style={{ color: 'var(--accent)' }}>
                April
              </div>
              <div className="prose text-sm" style={{ color: 'var(--text)' }}>
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  rehypePlugins={[rehypeHighlight]}
                  components={{
                    a: ({ href, children, ...props }) => (
                      <a {...props} href={href} target="_blank" rel="noreferrer">{children}</a>
                    )
                  }}
                >
                  {streamingText}
                </ReactMarkdown>
              </div>
            </div>
          )}
        </div>

        {/* Bottom bar */}
        <div
          className="flex items-center justify-between px-4 py-2.5 shrink-0"
          style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}
        >
          <span className="text-xs font-mono" style={{ color: 'var(--muted)' }}>
            {settings?.defaultModel ?? ''}
          </span>
          <div className="flex items-center gap-1.5">
            {messages.length > 0 && (
              <>
                <button
                  onClick={handleOpenInApp}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs transition-opacity hover:opacity-80"
                  style={{ color: 'var(--accent)', background: 'rgba(59,130,246,0.1)' }}
                >
                  <ExternalLink size={12} />
                  Open in April
                  <kbd className="ml-0.5 opacity-50 font-mono text-[10px]">{mod}O</kbd>
                </button>
                <button
                  onClick={handleReset}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs transition-opacity hover:opacity-80"
                  style={{ color: 'var(--muted)', background: 'rgba(255,255,255,0.05)' }}
                >
                  <RotateCcw size={12} />
                  New
                  <kbd className="ml-0.5 opacity-50 font-mono text-[10px]">{mod}N</kbd>
                </button>
              </>
            )}
            <button
              onClick={() => window.close()}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs transition-opacity hover:opacity-80"
              style={{ color: 'var(--muted)', background: 'rgba(255,255,255,0.05)' }}
            >
              <X size={12} />
              Close
              <kbd className="ml-0.5 opacity-50 font-mono text-[10px]">Esc</kbd>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
