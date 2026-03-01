import { useState, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import rehypeHighlight from 'rehype-highlight'
import remarkGfm from 'remark-gfm'
import { Copy, Check, Download, X, AlertCircle, RotateCcw } from 'lucide-react'
import { ActivityLog } from './ActivityLog'
import type { Message as MessageType, ContentBlock } from '../types'

interface Props {
  message: MessageType
  isStreaming?: boolean
  onRetry?: () => void
}

function CodeBlock({ children, ...props }: React.HTMLAttributes<HTMLPreElement>): JSX.Element {
  const preRef = useRef<HTMLPreElement>(null)
  const [copied, setCopied] = useState(false)

  const handleCopy = async (): Promise<void> => {
    const text = preRef.current?.innerText ?? ''
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="relative group/code my-2">
      <pre
        ref={preRef}
        {...props}
        className="rounded-md p-4 overflow-x-auto text-xs my-0"
        style={{ background: 'var(--surface-alt)', border: '1px solid var(--border)' }}
      >
        {children}
      </pre>
      <button
        onClick={handleCopy}
        className="absolute top-2 right-2 p-1 rounded opacity-0 group-hover/code:opacity-100 transition-opacity hover:opacity-80"
        style={{ color: 'var(--muted)' }}
        title="Copy code"
      >
        {copied ? <Check size={13} /> : <Copy size={13} />}
      </button>
    </div>
  )
}

function CopyButton({ text }: { text: string }): JSX.Element {
  const [copied, setCopied] = useState(false)

  const handleCopy = async (): Promise<void> => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <button
      onClick={handleCopy}
      className="p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity hover:opacity-80"
      style={{ color: 'var(--muted)' }}
      title="Copy"
    >
      {copied ? <Check size={13} /> : <Copy size={13} />}
    </button>
  )
}

function downloadImage(src: string): void {
  const link = document.createElement('a')
  link.href = src
  link.download = `image-${Date.now()}.png`
  link.click()
}

function TextContent({ text, showCursor }: { text: string; showCursor?: boolean }): JSX.Element {
  return (
    <div className={`prose text-sm${showCursor ? ' streaming-cursor' : ''}`} style={{ color: 'var(--text)' }}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          // Suppress markdown image syntax — generated images are rendered as ContentBlocks
          img: () => null,
          // Open all links in the system browser, never in the app window
          a: ({ href, children, ...props }) => (
            <a {...props} href={href} target="_blank" rel="noreferrer">
              {children}
            </a>
          ),
          // Suppress full-width horizontal rules
          hr: () => null,
          // Tables
          table: ({ children }) => (
            <div className="overflow-x-auto my-2">
              <table
                className="text-xs border-collapse w-full"
                style={{ borderColor: 'var(--border)' }}
              >
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => (
            <thead style={{ background: 'var(--surface-alt)' }}>{children}</thead>
          ),
          th: ({ children }) => (
            <th
              className="px-3 py-1.5 text-left font-medium border"
              style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}
            >
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td
              className="px-3 py-1.5 border"
              style={{ borderColor: 'var(--border)' }}
            >
              {children}
            </td>
          ),
          pre: CodeBlock,
          code: ({ className, children, ...props }) => {
            const isBlock = className?.includes('language-')
            if (isBlock) {
              return (
                <code className={className} {...props}>
                  {children}
                </code>
              )
            }
            return (
              <code
                className="px-1 py-0.5 rounded text-xs"
                style={{ background: 'var(--surface-alt)', color: '#e879f9' }}
                {...props}
              >
                {children}
              </code>
            )
          }
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  )
}

export function Message({ message, isStreaming = false, onRetry }: Props): JSX.Element {
  const isUser = message.role === 'user'
  const label = isUser ? 'You' : 'April'
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null)

  // Split into renderable items: text nodes, image nodes, + one activity slot
  // The activity slot appears where the first non-text/non-image block is
  type RenderItem =
    | { kind: 'text'; text: string }
    | { kind: 'image'; block: { type: 'image'; mediaType: string; data: string } }
    | { kind: 'activity'; blocks: ContentBlock[] }

  const items: RenderItem[] = []
  const activityBlocks: ContentBlock[] = []
  let activitySlotInserted = false

  for (const block of message.blocks) {
    if (block.type === 'text') {
      items.push({ kind: 'text', text: block.text })
    } else if (block.type === 'image') {
      items.push({ kind: 'image', block: block as { type: 'image'; mediaType: string; data: string } })
    } else {
      activityBlocks.push(block)
      if (!activitySlotInserted) {
        items.push({ kind: 'activity', blocks: activityBlocks })
        activitySlotInserted = true
      }
    }
  }

  const allText = message.blocks
    .filter((b) => b.type === 'text')
    .map((b) => (b as { type: 'text'; text: string }).text)
    .join('\n')

  return (
    <div
      className="group px-6 py-4 border-b"
      style={{
        borderColor: 'var(--border)',
        background: isUser ? 'var(--surface-alt)' : 'transparent'
      }}
    >
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium" style={{ color: 'var(--muted)' }}>
            {label}
          </span>
          {!isUser && allText && <CopyButton text={allText} />}
        </div>

        <div className="space-y-1">
          {items.map((item, i) => {
            const fadeClass = isStreaming ? ' fade-in' : ''
            if (item.kind === 'text') {
              const isLastText = (() => {
                for (let j = items.length - 1; j >= 0; j--) {
                  if (items[j].kind === 'text') return j === i
                }
                return false
              })()
              return (
                <div key={i} className={fadeClass.trim()}>
                  <TextContent text={item.text} showCursor={isStreaming && isLastText} />
                </div>
              )
            }
            if (item.kind === 'image') {
              const src = `data:${item.block.mediaType};base64,${item.block.data}`
              return (
                <div key={i} className={`relative group/img inline-block my-1${fadeClass}`}>
                  <img
                    src={src}
                    alt="Generated image"
                    className="max-h-64 rounded-md cursor-zoom-in block"
                    style={{ border: '1px solid var(--border)' }}
                    onClick={() => setLightboxSrc(src)}
                  />
                  <button
                    onClick={() => downloadImage(src)}
                    className="absolute bottom-2 right-2 p-1.5 rounded-md opacity-0 group-hover/img:opacity-100 transition-opacity"
                    style={{ background: 'rgba(0,0,0,0.65)', color: 'white' }}
                    title="Download"
                  >
                    <Download size={13} />
                  </button>
                </div>
              )
            }
            return (
              <ActivityLog
                key="activity"
                blocks={item.blocks}
                isStreaming={isStreaming}
              />
            )
          })}

          {/* Error state on failed user messages */}
          {message.error && (
            <div
              className="flex items-start gap-2 mt-2 px-3 py-2 rounded-lg text-xs"
              style={{
                background: 'rgba(239,68,68,0.08)',
                border: '1px solid rgba(239,68,68,0.2)',
                color: '#f87171'
              }}
            >
              <AlertCircle size={13} className="shrink-0 mt-0.5" />
              <span className="flex-1">{message.error}</span>
              {onRetry && (
                <button
                  onClick={onRetry}
                  className="flex items-center gap-1 shrink-0 hover:opacity-80 transition-opacity"
                  title="Retry"
                >
                  <RotateCcw size={11} />
                  <span>Retry</span>
                </button>
              )}
            </div>
          )}

          {/* Empty state while streaming first response */}
          {message.blocks.length === 0 && isStreaming && (
            <div className="flex items-center gap-2 py-1" style={{ color: 'var(--muted)' }}>
              <div
                className="w-1.5 h-1.5 rounded-full animate-pulse"
                style={{ background: 'var(--accent)' }}
              />
              <span className="text-xs">Thinking...</span>
            </div>
          )}
        </div>
      </div>

      {/* Lightbox */}
      {lightboxSrc && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.85)' }}
          onClick={() => setLightboxSrc(null)}
        >
          <img
            src={lightboxSrc}
            alt="Full resolution"
            className="max-w-[90vw] max-h-[90vh] rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
          <div className="absolute top-4 right-4 flex gap-2">
            <button
              onClick={() => downloadImage(lightboxSrc)}
              className="p-2 rounded-full"
              style={{ background: 'rgba(0,0,0,0.6)', color: 'white' }}
              title="Download full resolution"
            >
              <Download size={16} />
            </button>
            <button
              onClick={() => setLightboxSrc(null)}
              className="p-2 rounded-full"
              style={{ background: 'rgba(0,0,0,0.6)', color: 'white' }}
              title="Close"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
