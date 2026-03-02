import { useEffect, useRef, useMemo, useState, useCallback } from 'react'
import { MessageSquare, AlertCircle, Copy, Check } from 'lucide-react'
import { Message } from './Message'
import { InputBar } from './InputBar'
import { useConversationsStore } from '../stores/conversations'
import { useSettingsStore } from '../stores/settings'
import { useChat } from '../hooks/useChat'
import { useVoice } from '../hooks/useVoice'
import type { Message as MessageType } from '../types'

function estimateTokens(messages: MessageType[]): number {
  let chars = 0
  for (const msg of messages) {
    for (const block of msg.blocks) {
      if (block.type === 'text') chars += block.text.length
      else if (block.type === 'thinking') chars += (block as { type: 'thinking'; thinking: string }).thinking.length
      else if (block.type === 'image') chars += 800
    }
  }
  return Math.round(chars / 4)
}

function getContextWindow(model: string): number | null {
  const m = model.toLowerCase()
  if (m.includes('claude')) return 200000
  if (m.includes('o1') || m.includes('o3')) return 200000
  if (m.includes('gpt-4o')) return 128000
  if (m.includes('gpt-4-turbo')) return 128000
  if (m.includes('gpt-4')) return 8192
  if (m.includes('gpt-3.5')) return 16385
  return null
}

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
  const { streamingState, sendMessage, stopStreaming, retryMessage } = useChat(activeId)
  const voice = useVoice()
  const activeStream = activeId ? streamingState[activeId] : undefined
  const isActiveStreaming = !!activeStream
  const lastInputWasVoiceRef = useRef(false)
  const prevStreamingRef = useRef(false)

  const hasOpenAIKey = !!settings?.openaiApiKey

  const handleMicClick = useCallback(() => {
    if (voice.isRecording) {
      voice.stopRecording().then((text) => {
        if (text && settings) {
          lastInputWasVoiceRef.current = true
          sendMessage(text, settings.defaultModel, settings.defaultProvider)
        }
      })
    } else {
      voice.startRecording()
    }
  }, [voice, settings, sendMessage])

  const missingKey =
    settings !== null &&
    ((settings.defaultProvider === 'anthropic' && !settings.anthropicApiKey) ||
      (settings.defaultProvider === 'openai' && !settings.openaiApiKey))

  const scrollRef = useRef<HTMLDivElement>(null)
  const activeConv = conversations.find((c) => c.id === activeId)

  // Auto-play TTS when streaming finishes after a voice input
  useEffect(() => {
    const wasStreaming = prevStreamingRef.current
    prevStreamingRef.current = isActiveStreaming

    if (wasStreaming && !isActiveStreaming && lastInputWasVoiceRef.current && settings?.voiceAutoPlay) {
      lastInputWasVoiceRef.current = false
      const lastAssistant = activeConv?.messages.filter((m) => m.role === 'assistant').at(-1)
      if (lastAssistant) {
        const text = lastAssistant.blocks
          .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
          .map((b) => b.text)
          .join('\n')
        if (text) voice.speak(lastAssistant.id, text)
      }
    }
  }, [isActiveStreaming, settings?.voiceAutoPlay, activeConv?.messages, voice])

  const isMac = navigator.userAgent.toLowerCase().includes('mac')
  const newChatShortcut = isMac ? '⌘N' : 'Ctrl+N'

  // Pick 4 random suggestions when a new empty conversation is opened
  const suggestions = useMemo(() => {
    const shuffled = [...SUGGESTIONS].sort(() => Math.random() - 0.5)
    return shuffled.slice(0, 4)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId])

  // Auto-scroll to bottom on new messages or streaming updates
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [activeConv?.messages, activeStream])

  const [copied, setCopied] = useState(false)

  const lastModel = activeConv?.messages
    .filter((m) => m.role === 'assistant' && m.model)
    .at(-1)?.model ?? settings?.defaultModel

  const model = lastModel ?? ''
  const tokenEstimate = activeConv ? estimateTokens(activeConv.messages) : 0
  const contextWindow = getContextWindow(model)
  const contextPct = contextWindow ? Math.min(100, Math.ceil((tokenEstimate / contextWindow) * 100)) : null
  const contextColor =
    contextPct === null ? 'var(--muted)'
    : contextPct >= 80 ? '#ef4444'
    : contextPct >= 50 ? '#f59e0b'
    : 'var(--muted)'

  const copyConversation = useCallback(() => {
    if (!activeConv || activeConv.messages.length === 0) return
    const text = activeConv.messages
      .map((m) => {
        const role = m.role === 'user' ? 'You' : 'Assistant'
        const content = m.blocks
          .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
          .map((b) => b.text)
          .join('\n')
        return `${role}:\n${content}`
      })
      .join('\n\n')
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [activeConv])

  if (!activeId || !activeConv) {
    return (
      <div className="flex-1 flex flex-col" style={{ background: 'var(--bg)' }}>
        <div
          className="drag-region flex items-center px-4 shrink-0"
          style={{ height: 38, borderBottom: '1px solid var(--border)' }}
        />
        <div className="flex-1 flex flex-col items-center justify-center gap-2">
          <MessageSquare size={36} style={{ color: 'var(--border)' }} />
          <p className="text-sm" style={{ color: 'var(--muted)' }}>No conversation selected</p>
          <p className="text-xs" style={{ color: 'var(--muted)', opacity: 0.6 }}>
            Press <kbd
              className="px-1.5 py-0.5 rounded text-xs font-mono"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--muted)' }}
            >{newChatShortcut}</kbd> to start a new one
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden" style={{ background: 'var(--bg)' }}>
      {/* Top bar */}
      <div
        className="drag-region flex items-center justify-between px-4 shrink-0"
        style={{ height: 38, borderBottom: '1px solid var(--border)' }}
      >
        <div className="flex items-center gap-2">
          <span className="text-xs" style={{ color: 'var(--muted)', opacity: 0.7 }}>
            {lastModel ?? ''}
          </span>
          {contextPct !== null && activeConv.messages.length > 0 && (
            <>
              <span style={{ color: 'var(--muted)', fontSize: '10px', opacity: 0.5 }}>·</span>
              <span className="text-xs" style={{ color: contextColor, opacity: 0.8 }}>{contextPct}% ctx</span>
            </>
          )}
        </div>
        {activeConv.messages.length > 0 && (
          <button
            className="no-drag flex items-center gap-1 text-xs px-1.5 py-0.5 rounded transition-colors hover:opacity-80"
            style={{ color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer' }}
            onClick={copyConversation}
            title="Copy conversation"
          >
            {copied ? <Check size={13} /> : <Copy size={13} />}
          </button>
        )}
      </div>
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
            {activeConv.messages.map((msg, i) => {
              const message = activeStream && msg.id === activeStream.msgId
                ? { ...msg, blocks: activeStream.blocks }
                : msg
              return (
                <Message
                  key={msg.id}
                  message={message}
                  isStreaming={isActiveStreaming && i === activeConv.messages.length - 1}
                  onRetry={msg.role === 'user' && msg.error ? () => retryMessage(msg) : undefined}
                  hasOpenAIKey={hasOpenAIKey}
                  voicePhase={voice.speakingState?.id === msg.id ? voice.speakingState.phase : null}
                  onSpeak={(text) => voice.speak(msg.id, text)}
                  onStopSpeaking={voice.stopSpeaking}
                />
              )
            })}
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
        isStreaming={isActiveStreaming}
        missingKey={missingKey}
        hasOpenAIKey={hasOpenAIKey}
        isRecording={voice.isRecording}
        isTranscribing={voice.isTranscribing}
        recordingSeconds={voice.recordingSeconds}
        onMicClick={handleMicClick}
      />
    </div>
  )
}
