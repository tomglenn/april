import { useEffect, useRef } from 'react'
import { MessageSquare } from 'lucide-react'
import { Message } from './Message'
import { InputBar } from './InputBar'
import { useConversationsStore } from '../stores/conversations'
import { useChat } from '../hooks/useChat'

export function ConversationView(): JSX.Element {
  const { activeId, conversations } = useConversationsStore()
  const { isStreaming, sendMessage, stopStreaming, retryMessage } = useChat(activeId)
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
            {activeConv.messages.map((msg, i) => (
              <Message
                key={msg.id}
                message={msg}
                isStreaming={isStreaming && i === activeConv.messages.length - 1}
                onRetry={msg.role === 'user' && msg.error ? () => retryMessage(msg) : undefined}
              />
            ))}
          </>
        )}
      </div>

      {/* Input */}
      <InputBar onSend={sendMessage} onStop={stopStreaming} isStreaming={isStreaming} />
    </div>
  )
}
