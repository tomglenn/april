import { useEffect, useRef, useState, useMemo } from 'react'
import Fuse from 'fuse.js'
import { useConversationsStore } from '../stores/conversations'

interface SearchItem {
  id: string
  title: string
  content: string
  updatedAt: number
}

interface Props {
  onClose: () => void
}

export function QuickSwitcher({ onClose }: Props): JSX.Element {
  const { conversations, setActiveId } = useConversationsStore()
  const [query, setQuery] = useState('')
  const [selectedIdx, setSelectedIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const items: SearchItem[] = useMemo(
    () =>
      conversations.map((c) => ({
        id: c.id,
        title: c.title,
        content: c.messages
          .flatMap((m) => m.blocks)
          .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
          .map((b) => b.text)
          .join(' '),
        updatedAt: c.updatedAt
      })),
    [conversations]
  )

  const fuse = useMemo(
    () =>
      new Fuse(items, {
        keys: [
          { name: 'title', weight: 2 },
          { name: 'content', weight: 1 }
        ],
        threshold: 0.4,
        minMatchCharLength: 2,
        ignoreLocation: true
      }),
    [items]
  )

  const results: SearchItem[] = useMemo(() => {
    if (!query.trim()) return [...items].sort((a, b) => b.updatedAt - a.updatedAt)
    return fuse.search(query).map((r) => r.item)
  }, [query, items, fuse])

  useEffect(() => {
    setSelectedIdx(0)
  }, [query])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    const list = listRef.current
    if (!list) return
    const item = list.children[selectedIdx] as HTMLElement | undefined
    item?.scrollIntoView({ block: 'nearest' })
  }, [selectedIdx])

  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Escape') {
      onClose()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIdx((i) => Math.min(i + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIdx((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const result = results[selectedIdx]
      if (result) {
        setActiveId(result.id)
        onClose()
      }
    }
  }

  const getSnippet = (item: SearchItem): string | null => {
    if (!query.trim()) return null
    const conv = conversations.find((c) => c.id === item.id)
    if (!conv) return null
    const q = query.toLowerCase()
    for (const msg of conv.messages) {
      for (const block of msg.blocks) {
        if (block.type === 'text') {
          const lower = block.text.toLowerCase()
          const idx = lower.indexOf(q)
          if (idx >= 0) {
            const start = Math.max(0, idx - 30)
            const end = Math.min(block.text.length, idx + 50)
            return (
              (start > 0 ? '…' : '') +
              block.text.slice(start, end) +
              (end < block.text.length ? '…' : '')
            )
          }
        }
      }
    }
    return null
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center"
      style={{ background: 'rgba(0,0,0,0.5)', paddingTop: '20vh' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="w-full max-w-lg rounded-xl shadow-2xl overflow-hidden"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
      >
        <div style={{ borderBottom: '1px solid var(--border)' }}>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search conversations…"
            className="w-full px-4 py-3 text-sm outline-none"
            style={{ background: 'transparent', color: 'var(--text)' }}
          />
        </div>
        <div ref={listRef} className="overflow-y-auto" style={{ maxHeight: '320px' }}>
          {results.length === 0 ? (
            <div className="px-4 py-3 text-sm" style={{ color: 'var(--muted)' }}>
              No conversations found
            </div>
          ) : (
            results.map((item, i) => {
              const snippet = getSnippet(item)
              return (
                <div
                  key={item.id}
                  onClick={() => {
                    setActiveId(item.id)
                    onClose()
                  }}
                  onMouseEnter={() => setSelectedIdx(i)}
                  className="px-4 py-2.5 cursor-pointer"
                  style={{
                    background: i === selectedIdx ? 'var(--bg)' : 'transparent',
                    borderLeft:
                      i === selectedIdx ? '2px solid var(--accent)' : '2px solid transparent'
                  }}
                >
                  <div className="text-sm truncate" style={{ color: 'var(--text)' }}>
                    {item.title}
                  </div>
                  {snippet && (
                    <div className="text-xs mt-0.5 truncate" style={{ color: 'var(--muted)' }}>
                      {snippet}
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
