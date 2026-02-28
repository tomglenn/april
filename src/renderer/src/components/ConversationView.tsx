import { useEffect, useRef, useMemo } from 'react'
import { MessageSquare, AlertCircle } from 'lucide-react'
import { Message } from './Message'
import { InputBar } from './InputBar'
import { useConversationsStore } from '../stores/conversations'
import { useSettingsStore } from '../stores/settings'
import { useChat } from '../hooks/useChat'

const SUGGESTIONS = [
  'Explain how transformers work in AI',
  'Help me write a professional email',
  'What are some habits of highly productive people?',
  'Write a Python script to rename files in a folder',
  "What's the best way to structure a React project?",
  'Explain the difference between async/await and promises',
  'Give me 5 name ideas for a productivity app',
  'How do I negotiate a higher salary?',
  'Explain recursion with a simple real-world example',
  'What are the SOLID principles?',
  'Help me plan a healthy weekly meal plan',
  'Explain the CAP theorem simply',
  'Write a bash script to back up a directory',
  'What questions should I ask in a job interview?',
  "What's a good morning routine for developers?",
  'Explain Docker and when I should use it',
  'Help me write a git commit message for my changes',
  'Summarise the key ideas from The Pragmatic Programmer',
  'What are common React performance pitfalls?',
  'Explain the difference between SQL and NoSQL databases',
]

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

  const isMac = navigator.userAgent.toLowerCase().includes('mac')
  const newChatShortcut = isMac ? '⌘N' : 'Ctrl+N'

  // Pick 4 random suggestions when a new empty conversation is opened
  const suggestions = useMemo(() => {
    const shuffled = [...SUGGESTIONS].sort(() => Math.random() - 0.5)
    return shuffled.slice(0, 4)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId])

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [activeConv?.messages])

  if (!activeId || !activeConv) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-2" style={{ background: 'var(--bg)' }}>
        <MessageSquare size={36} style={{ color: 'var(--border)' }} />
        <p className="text-sm" style={{ color: 'var(--muted)' }}>No conversation selected</p>
        <p className="text-xs" style={{ color: 'var(--muted)', opacity: 0.6 }}>
          Press <kbd
            className="px-1.5 py-0.5 rounded text-xs font-mono"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--muted)' }}
          >{newChatShortcut}</kbd> to start a new one
        </p>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden" style={{ background: 'var(--bg)' }}>
      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {activeConv.messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full px-6">
            <p className="text-base font-medium" style={{ color: 'var(--text)' }}>
              What can I help with?
            </p>
            <p className="text-xs mb-5" style={{ color: 'var(--muted)', opacity: 0.7 }}>
              A few ideas to get you started — or just type anything below.
            </p>
            <div className="grid grid-cols-2 gap-2 w-full max-w-lg">
              {suggestions.map((s) => (
                <button
                  key={s}
                  onClick={() => {
                    if (!settings || missingKey) return
                    sendMessage(s, settings.defaultModel, settings.defaultProvider)
                  }}
                  className="text-left px-3 py-2.5 rounded-lg text-xs transition-colors hover:opacity-80"
                  style={{
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    color: 'var(--muted)',
                    lineHeight: '1.4'
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
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
      <InputBar
        onSend={sendMessage}
        onStop={stopStreaming}
        isStreaming={isStreaming}
        missingKey={missingKey}
      />
    </div>
  )
}
