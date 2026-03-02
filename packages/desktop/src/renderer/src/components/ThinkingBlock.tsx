import { useState } from 'react'
import { ChevronRight, Brain } from 'lucide-react'

interface Props {
  thinking: string
}

export function ThinkingBlock({ thinking }: Props): JSX.Element {
  const [open, setOpen] = useState(false)

  const firstLine = thinking.split('\n')[0]?.slice(0, 80) || 'Thinking...'

  return (
    <div className="my-1 rounded-md overflow-hidden" style={{ background: 'var(--surface-alt)', border: '1px solid var(--border)' }}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 w-full px-3 py-2 text-left hover:opacity-80 transition-opacity"
        style={{ color: 'var(--muted)' }}
      >
        <Brain size={13} />
        <span className="text-xs font-medium">Thinking</span>
        <ChevronRight
          size={13}
          className="transition-transform ml-1"
          style={{ transform: open ? 'rotate(90deg)' : 'rotate(0deg)' }}
        />
        {!open && (
          <span className="text-xs truncate opacity-70 ml-1">{firstLine}</span>
        )}
      </button>
      {open && (
        <div
          className="px-3 pb-3 text-xs font-mono whitespace-pre-wrap leading-relaxed"
          style={{ color: 'var(--muted)', borderTop: '1px solid var(--border)' }}
        >
          <div className="pt-2">{thinking}</div>
        </div>
      )}
    </div>
  )
}
