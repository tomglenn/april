import ReactMarkdown from 'react-markdown'
import rehypeHighlight from 'rehype-highlight'
import { ThinkingBlock } from './ThinkingBlock'
import { ToolBlock } from './ToolBlock'
import type { Message as MessageType } from '../types'
import { Copy, Check } from 'lucide-react'
import { useState } from 'react'

interface Props {
  message: MessageType
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

export function Message({ message }: Props): JSX.Element {
  const isUser = message.role === 'user'
  const label = isUser ? 'You' : 'April'

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
          <span
            className="text-xs font-medium"
            style={{ color: 'var(--muted)' }}
          >
            {label}
          </span>
          {!isUser && allText && <CopyButton text={allText} />}
        </div>

        <div className="space-y-1">
          {message.blocks.map((block, i) => {
            if (block.type === 'text') {
              return (
                <div key={i} className="prose text-sm" style={{ color: 'var(--text)' }}>
                  <ReactMarkdown
                    rehypePlugins={[rehypeHighlight]}
                    components={{
                      pre: ({ children, ...props }) => (
                        <div className="relative group/code">
                          <pre
                            {...(props as React.HTMLAttributes<HTMLPreElement>)}
                            className="rounded-md p-4 overflow-x-auto text-xs my-2"
                            style={{ background: 'var(--surface-alt)', border: '1px solid var(--border)' }}
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
                    {block.text}
                  </ReactMarkdown>
                </div>
              )
            }

            if (block.type === 'thinking') {
              return <ThinkingBlock key={i} thinking={block.thinking} />
            }

            if (block.type === 'tool_use') {
              return <ToolBlock key={i} type="tool_use" id={block.id} name={block.name} input={block.input} />
            }

            if (block.type === 'tool_result') {
              return <ToolBlock key={i} type="tool_result" tool_use_id={block.tool_use_id} content={block.content} />
            }

            return null
          })}

          {message.blocks.length === 0 && (
            <div className="flex items-center gap-2" style={{ color: 'var(--muted)' }}>
              <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: 'var(--accent)' }} />
              <span className="text-sm">Thinking...</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
