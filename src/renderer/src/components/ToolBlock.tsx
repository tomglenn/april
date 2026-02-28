import { useState } from 'react'
import { ChevronRight, Wrench } from 'lucide-react'

interface ToolUseProps {
  type: 'tool_use'
  id: string
  name: string
  input: unknown
}

interface ToolResultProps {
  type: 'tool_result'
  tool_use_id: string
  content: string
}

type Props = ToolUseProps | ToolResultProps

export function ToolBlock(props: Props): JSX.Element {
  const [open, setOpen] = useState(false)

  if (props.type === 'tool_use') {
    const inputStr = JSON.stringify(props.input, null, 2)
    const firstLine = `${props.name}(${Object.keys(props.input as Record<string, unknown>).join(', ')})`

    return (
      <div className="my-1 rounded-md overflow-hidden" style={{ background: 'var(--surface-alt)', border: '1px solid var(--border)' }}>
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-2 w-full px-3 py-2 text-left hover:opacity-80 transition-opacity"
          style={{ color: 'var(--muted)' }}
        >
          <Wrench size={13} />
          <span className="text-xs font-medium font-mono">{props.name}</span>
          <ChevronRight
            size={13}
            className="transition-transform ml-1"
            style={{ transform: open ? 'rotate(90deg)' : 'rotate(0deg)' }}
          />
          {!open && (
            <span className="text-xs truncate opacity-70 ml-1 font-mono">{firstLine}</span>
          )}
        </button>
        {open && (
          <div
            className="px-3 pb-3 text-xs font-mono whitespace-pre-wrap"
            style={{ color: 'var(--text)', borderTop: '1px solid var(--border)' }}
          >
            <div className="pt-2">{inputStr}</div>
          </div>
        )}
      </div>
    )
  }

  // tool_result
  const preview = props.content?.slice(0, 80) || 'No output'
  return (
    <div className="my-1 rounded-md overflow-hidden" style={{ background: 'var(--surface-alt)', border: '1px solid var(--border)' }}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 w-full px-3 py-2 text-left hover:opacity-80 transition-opacity"
        style={{ color: 'var(--muted)' }}
      >
        <Wrench size={13} className="opacity-50" />
        <span className="text-xs font-medium">Result</span>
        <ChevronRight
          size={13}
          className="transition-transform ml-1"
          style={{ transform: open ? 'rotate(90deg)' : 'rotate(0deg)' }}
        />
        {!open && (
          <span className="text-xs truncate opacity-70 ml-1 font-mono">{preview}</span>
        )}
      </button>
      {open && (
        <div
          className="px-3 pb-3 text-xs font-mono whitespace-pre-wrap"
          style={{ color: 'var(--text)', borderTop: '1px solid var(--border)' }}
        >
          <div className="pt-2">{props.content}</div>
        </div>
      )}
    </div>
  )
}
