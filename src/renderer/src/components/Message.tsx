import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import rehypeHighlight from 'rehype-highlight'
import { Copy, Check } from 'lucide-react'
import { ActivityLog } from './ActivityLog'
import type { Message as MessageType, ContentBlock } from '../types'

interface Props {
  message: MessageType
  isStreaming?: boolean
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

function TextContent({ text }: { text: string }): JSX.Element {
  return (
    <div className="prose text-sm" style={{ color: 'var(--text)' }}>
      <ReactMarkdown
        rehypePlugins={[rehypeHighlight]}
        components={{
          pre: ({ children, ...props }) => (
            <div className="relative group/code">
              <pre
                {...(props as React.HTMLAttributes<HTMLPreElement>)}
                className="rounded-md p-4 overflow-x-auto text-xs my-2"
                style={{
                  background: 'var(--surface-alt)',
                  border: '1px solid var(--border)'
                }}
              >
                {children}
              </pre>
            </div>
          ),
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

export function Message({ message, isStreaming = false }: Props): JSX.Element {
  const isUser = message.role === 'user'
  const label = isUser ? 'You' : 'April'

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
            if (item.kind === 'text') {
              return <TextContent key={i} text={item.text} />
            }
            if (item.kind === 'image') {
              return (
                <img
                  key={i}
                  src={`data:${item.block.mediaType};base64,${item.block.data}`}
                  alt=""
                  className="max-h-48 rounded-md my-1"
                  style={{ border: '1px solid var(--border)' }}
                />
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

          {/* Empty state while streaming first response */}
          {message.blocks.length === 0 && (
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
    </div>
  )
}
