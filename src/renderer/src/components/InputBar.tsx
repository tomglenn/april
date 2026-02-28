import { useState, useRef, useEffect, KeyboardEvent } from 'react'
import { Send } from 'lucide-react'
import { useSettingsStore } from '../stores/settings'

interface Props {
  onSend: (text: string, model: string, provider: string) => void
  isStreaming: boolean
}

export function InputBar({ onSend, isStreaming }: Props): JSX.Element {
  const { settings } = useSettingsStore()
  const [text, setText] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = Math.min(ta.scrollHeight, 120) + 'px'
  }, [text])

  const handleSend = (): void => {
    const trimmed = text.trim()
    if (!trimmed || isStreaming || !settings) return
    onSend(trimmed, settings.defaultModel, settings.defaultProvider)
    setText('')
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div
      className="px-4 py-3 border-t"
      style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
    >
      <div
        className="flex items-end gap-2 rounded-xl p-2"
        style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}
      >
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Message April..."
          rows={1}
          className="flex-1 resize-none bg-transparent text-sm outline-none py-1 px-1"
          style={{ color: 'var(--text)', maxHeight: '120px', lineHeight: '1.5' }}
        />

        <button
          onClick={handleSend}
          disabled={!text.trim() || isStreaming || !settings}
          className="p-2 rounded-lg transition-all shrink-0 mb-0.5 disabled:opacity-40"
          style={{
            background: text.trim() && !isStreaming ? 'var(--accent)' : 'var(--surface)',
            color: text.trim() && !isStreaming ? 'white' : 'var(--muted)'
          }}
        >
          <Send size={14} />
        </button>
      </div>
    </div>
  )
}
