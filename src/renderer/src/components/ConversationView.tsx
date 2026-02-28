import { useEffect, useRef } from 'react'
import { MessageSquare, AlertCircle } from 'lucide-react'
import { Message } from './Message'
import { InputBar } from './InputBar'
import { useConversationsStore } from '../stores/conversations'
import { useSettingsStore } from '../stores/settings'
import { useChat } from '../hooks/useChat'

interface Props {
  onOpenSettings: () => void
}

export function ConversationView({ onOpenSettings }: Props): JSX.Element {
  const { activeId, conversations } = useConversationsStore()
  const { settings } = useSettingsStore()
  const { isStreaming, sendMessage, stopStreaming, retryMessage } = useChat(activeId)

  const missingKey =
    settings !== null &&
    ((settings.defaultProvider === 'anthropic' && !settings.anthropicApiKey) ||
      (settings.defaultProvider === 'openai' && !settings.openaiApiKey))
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

      {/* Missing key banner */}
      {missingKey && (
        <div
          className="flex items-center gap-2 px-4 py-2.5 text-xs"
          style={{ background: 'var(--surface)', borderTop: '1px solid var(--border)', color: 'var(--muted)' }}
        >
          <AlertCircle size={13} style={{ color: 'var(--accent)', flexShrink: 0 }} />
          <span>
            No {settings?.defaultProvider === 'anthropic' ? 'Anthropic' : 'OpenAI'} API key configured.{' '}
            <button
              onClick={onOpenSettings}
              className="underline hover:opacity-80 transition-opacity"
              style={{ color: 'var(--text)', background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 'inherit' }}
            >
              Open Settings
            </button>{' '}
            to add one.
          </span>
        </div>
      )}

      {/* Input */}
      <InputBar onSend={sendMessage} onStop={stopStreaming} isStreaming={isStreaming} missingKey={missingKey} />
    </div>
  )
}
