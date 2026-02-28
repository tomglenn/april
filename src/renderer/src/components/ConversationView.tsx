import { useEffect, useRef } from 'react'
import { MessageSquare } from 'lucide-react'
import { Message } from './Message'
import { InputBar } from './InputBar'
import { useConversationsStore } from '../stores/conversations'
import { useChat } from '../hooks/useChat'

export function ConversationView(): JSX.Element {
  const { activeId, conversations } = useConversationsStore()
  const { isStreaming, error, sendMessage } = useChat(activeId)
  const scrollRef = useRef<HTMLDivElement>(null)

  const activeConv = conversations.find((c) => c.id === activeId)

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [activeConv?.messages])

  if (!activeId || !activeConv) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center" style={{ background: 'var(--bg)' }}>
        <MessageSquare size={48} style={{ color: 'var(--border)' }} />
        <p className="mt-4 text-sm" style={{ color: 'var(--muted)' }}>
          Select a conversation or start a new one
        </p>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden" style={{ background: 'var(--bg)' }}>
      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {activeConv.messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full">
            <MessageSquare size={32} style={{ color: 'var(--border)' }} />
            <p className="mt-3 text-sm" style={{ color: 'var(--muted)' }}>
              Start a conversation
            </p>
          </div>
        ) : (
          <>
            {activeConv.messages.map((msg) => (
              <Message key={msg.id} message={msg} />
            ))}
            {isStreaming && activeConv.messages[activeConv.messages.length - 1]?.role === 'user' && (
              <div className="px-6 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
                <div className="max-w-3xl mx-auto">
                  <div className="flex items-center gap-2" style={{ color: 'var(--muted)' }}>
                    <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: 'var(--accent)' }} />
                    <span className="text-sm">Responding...</span>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Error bar */}
      {error && (
        <div
          className="px-4 py-2 text-xs"
          style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171', borderTop: '1px solid rgba(239,68,68,0.2)' }}
        >
          Error: {error}
        </div>
      )}

      {/* Input */}
      <InputBar onSend={sendMessage} isStreaming={isStreaming} />
    </div>
  )
}
