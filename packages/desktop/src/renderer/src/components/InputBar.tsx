import {
  useState,
  useRef,
  useEffect,
  useCallback,
  KeyboardEvent,
  DragEvent,
  ClipboardEvent,
  ChangeEvent
} from 'react'
import { Send, Square, Paperclip, X, Mic, Loader } from 'lucide-react'
import { useConversationsStore } from '../stores/conversations'
import type { ImageAttachment } from '../types'

interface Props {
  onSend: (text: string, model: string, provider: string, images?: ImageAttachment[]) => void
  onStop: () => void
  isStreaming: boolean
  model: string
  provider: string
  missingKey?: boolean
  prefill?: string
  hasOpenAIKey?: boolean
  isRecording?: boolean
  isTranscribing?: boolean
  recordingSeconds?: number
  onMicClick?: () => void
}

async function resizeToAttachment(file: File): Promise<ImageAttachment> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = reject
    reader.onload = (e) => {
      const img = new Image()
      img.onerror = reject
      img.onload = () => {
        const maxWidth = 1568
        let { width, height } = img
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width)
          width = maxWidth
        }
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')!
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, width, height)
        ctx.drawImage(img, 0, 0, width, height)
        resolve({
          id: crypto.randomUUID(),
          dataUrl: canvas.toDataURL('image/jpeg', 0.85),
          mediaType: 'image/jpeg'
        })
      }
      img.src = e.target!.result as string
    }
    reader.readAsDataURL(file)
  })
}

export function InputBar({ onSend, onStop, isStreaming, model, provider, missingKey, prefill, hasOpenAIKey, isRecording, isTranscribing, recordingSeconds, onMicClick }: Props): JSX.Element {
  const { activeId } = useConversationsStore()
  const [text, setText] = useState('')

  useEffect(() => {
    if (prefill) {
      setText(prefill)
      textareaRef.current?.focus()
    }
  }, [prefill])
  const [images, setImages] = useState<ImageAttachment[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Focus when conversation changes
  useEffect(() => {
    textareaRef.current?.focus()
  }, [activeId])

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = Math.min(ta.scrollHeight, 120) + 'px'
  }, [text])

  const addFiles = useCallback(async (files: File[]) => {
    const imageFiles = files.filter((f) => f.type.startsWith('image/'))
    if (imageFiles.length === 0) return
    const attachments = await Promise.all(imageFiles.map(resizeToAttachment))
    setImages((prev) => [...prev, ...attachments])
  }, [])

  const handlePaste = useCallback(
    (e: ClipboardEvent<HTMLTextAreaElement>) => {
      const imageItems = Array.from(e.clipboardData.items).filter((item) =>
        item.type.startsWith('image/')
      )
      if (imageItems.length === 0) return
      e.preventDefault()
      const files = imageItems.map((item) => item.getAsFile()).filter(Boolean) as File[]
      addFiles(files)
    },
    [addFiles]
  )

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      setIsDragging(false)
      addFiles(Array.from(e.dataTransfer.files))
    },
    [addFiles]
  )

  const handleFileChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      addFiles(Array.from(e.target.files ?? []))
      if (fileInputRef.current) fileInputRef.current.value = ''
    },
    [addFiles]
  )

  const removeImage = useCallback((id: string) => {
    setImages((prev) => prev.filter((img) => img.id !== id))
  }, [])

  const handleSend = (): void => {
    const trimmed = text.trim()
    if ((!trimmed && images.length === 0) || isStreaming || !model) return
    onSend(trimmed, model, provider, images.length > 0 ? images : undefined)
    setText('')
    setImages([])
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const canSend = (text.trim().length > 0 || images.length > 0) && !isStreaming && !!model && !missingKey

  return (
    <div
      className="px-4 py-3 border-t"
      style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div
        className="flex items-end gap-2 rounded-xl p-2"
        style={{
          background: 'var(--bg)',
          border: `1px solid ${isDragging ? 'var(--accent)' : 'var(--border)'}`
        }}
      >
        <div className="flex-1 flex flex-col min-w-0">
          {/* Recording indicator */}
          {isRecording && (
            <div className="flex items-center gap-2 px-1 pt-1 pb-0.5">
              <div
                className="w-2 h-2 rounded-full animate-pulse"
                style={{ background: '#ef4444' }}
              />
              <span className="text-xs" style={{ color: '#ef4444' }}>
                {recordingSeconds ?? 0}s Recording...
              </span>
            </div>
          )}

          {/* Image preview strip */}
          {images.length > 0 && (
            <div className="flex gap-2 flex-wrap mb-2 pt-1 px-1">
              {images.map((img) => (
                <div key={img.id} className="relative group/thumb shrink-0">
                  <img
                    src={img.dataUrl}
                    alt=""
                    className="rounded-md object-cover"
                    style={{ width: '56px', height: '56px', border: '1px solid var(--border)' }}
                  />
                  <button
                    onClick={() => removeImage(img.id)}
                    className="absolute -top-1.5 -right-1.5 rounded-full p-0.5 opacity-0 group-hover/thumb:opacity-100 transition-opacity"
                    style={{
                      background: 'var(--surface)',
                      border: '1px solid var(--border)',
                      color: 'var(--muted)'
                    }}
                  >
                    <X size={10} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder="Ask anything…"
            rows={1}
            className="resize-none bg-transparent text-sm outline-none py-1 px-1 w-full"
            style={{ color: 'var(--text)', maxHeight: '120px', lineHeight: '1.5' }}
          />
        </div>

        <div className="flex items-center gap-1 shrink-0 mb-0.5">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="p-2 rounded-lg transition-all hover:opacity-80"
            style={{ color: 'var(--muted)' }}
            title="Attach image"
          >
            <Paperclip size={14} />
          </button>

          {hasOpenAIKey && !isStreaming && onMicClick && (
            <button
              onClick={onMicClick}
              disabled={isTranscribing}
              className="p-2 rounded-lg transition-all hover:opacity-80 disabled:opacity-40 relative"
              style={{ color: isRecording ? '#ef4444' : 'var(--muted)' }}
              title={isTranscribing ? 'Transcribing...' : isRecording ? 'Stop recording' : 'Voice input'}
            >
              {isTranscribing ? (
                <Loader size={14} className="animate-spin" />
              ) : (
                <>
                  <Mic size={14} />
                  {isRecording && (
                    <div
                      className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full animate-pulse"
                      style={{ background: '#ef4444' }}
                    />
                  )}
                </>
              )}
            </button>
          )}

          {isStreaming ? (
            <button
              onClick={onStop}
              className="p-2 rounded-lg transition-all"
              style={{ background: 'var(--surface)', color: 'var(--text)' }}
              title="Stop"
            >
              <Square size={14} />
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={!canSend}
              className="p-2 rounded-lg transition-all disabled:opacity-40"
              style={{
                background: canSend ? 'var(--accent)' : 'var(--surface)',
                color: canSend ? 'white' : 'var(--muted)'
              }}
            >
              <Send size={14} />
            </button>
          )}
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleFileChange}
      />
    </div>
  )
}
