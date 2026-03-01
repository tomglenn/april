import { useState, useRef, useEffect } from 'react'
import { ChevronRight, Search, Globe, CloudSun, Wrench, Brain, ImageIcon } from 'lucide-react'
import type { ContentBlock } from '../types'

interface Props {
  blocks: ContentBlock[]
  isStreaming: boolean
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function toolIcon(name: string): JSX.Element {
  switch (name) {
    case 'web_search': return <Search size={11} />
    case 'browse_url': return <Globe size={11} />
    case 'get_weather': return <CloudSun size={11} />
    case 'generate_image': return <ImageIcon size={11} />
    default: return <Wrench size={11} />
  }
}

function currentStatusLabel(blocks: ContentBlock[]): string {
  // The "current" action is the last tool_use block that has no matching tool_result yet
  const resultedIds = new Set(
    blocks
      .filter((b) => b.type === 'tool_result')
      .map((b) => (b as { type: 'tool_result'; tool_use_id: string }).tool_use_id)
  )

  for (let i = blocks.length - 1; i >= 0; i--) {
    const b = blocks[i]
    if (b.type === 'thinking') return 'Thinking...'
    if (b.type === 'tool_use' && !resultedIds.has(b.id)) {
      const inp = b.input as Record<string, string>
      switch (b.name) {
        case 'web_search':
          return inp.query ? `Searching "${inp.query.slice(0, 48)}"...` : 'Searching...'
        case 'browse_url': {
          try {
            const host = new URL(inp.url).hostname.replace(/^www\./, '')
            return `Browsing ${host}...`
          } catch {
            return 'Browsing page...'
          }
        }
        case 'get_weather':
          return inp.location ? `Checking weather in ${inp.location}...` : 'Checking weather...'
        case 'generate_image': {
          const gi = b.input as { prompt?: string; quality?: string; transparent?: boolean }
          const label = gi.transparent ? 'Generating (transparent)' : 'Generating'
          return gi.prompt
            ? `${label} "${gi.prompt.length > 30 ? gi.prompt.slice(0, 30) + '…' : gi.prompt}"`
            : 'Generating image...'
        }
        default:
          return `Running ${b.name}...`
      }
    }
    // If we hit a tool_result, the last action finished — we're between turns
    if (b.type === 'tool_result') return 'Working...'
  }

  return 'Working...'
}

function summaryLabel(blocks: ContentBlock[]): string {
  const toolUses = blocks.filter((b) => b.type === 'tool_use') as Array<{
    type: 'tool_use'
    name: string
  }>
  const hasThinking = blocks.some((b) => b.type === 'thinking')

  const counts: Record<string, number> = {}
  for (const t of toolUses) counts[t.name] = (counts[t.name] ?? 0) + 1

  const parts: string[] = []
  if (hasThinking) parts.push('thought')
  for (const [name, n] of Object.entries(counts)) {
    switch (name) {
      case 'web_search':
        parts.push(n === 1 ? 'searched' : `searched ${n}×`)
        break
      case 'browse_url':
        parts.push(n === 1 ? 'browsed a page' : `browsed ${n} pages`)
        break
      case 'get_weather':
        parts.push('checked weather')
        break
      case 'generate_image':
        parts.push(n === 1 ? 'generated image' : `generated ${n} images`)
        break
      default:
        parts.push(n === 1 ? name : `${name} ${n}×`)
    }
  }

  return parts.join(' · ')
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ActivityLog({ blocks, isStreaming }: Props): JSX.Element | null {
  const [expanded, setExpanded] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const startTimeRef = useRef<number>(Date.now())
  const currentToolIdRef = useRef<string | null>(null)

  // Track elapsed time for in-progress tool calls
  useEffect(() => {
    if (!isStreaming) {
      setElapsed(0)
      currentToolIdRef.current = null
      return
    }

    // Find current in-progress tool_use id
    const resultedIds = new Set(
      blocks
        .filter((b) => b.type === 'tool_result')
        .map((b) => (b as { type: 'tool_result'; tool_use_id: string }).tool_use_id)
    )
    let activeId: string | null = null
    for (let i = blocks.length - 1; i >= 0; i--) {
      const b = blocks[i]
      if (b.type === 'tool_use' && !resultedIds.has(b.id)) {
        activeId = b.id
        break
      }
    }

    // Reset timer when a new tool starts
    if (activeId !== currentToolIdRef.current) {
      currentToolIdRef.current = activeId
      startTimeRef.current = Date.now()
      setElapsed(0)
    }

    if (!activeId) return

    const interval = setInterval(() => {
      setElapsed((Date.now() - startTimeRef.current) / 1000)
    }, 100)
    return () => clearInterval(interval)
  }, [isStreaming, blocks])

  if (blocks.length === 0) return null

  // ── Streaming: single animated status line ────────────────────────────────
  if (isStreaming) {
    return (
      <div className="flex items-center gap-2 py-1 my-1" style={{ color: 'var(--muted)' }}>
        <div
          className="w-1.5 h-1.5 rounded-full shrink-0 animate-pulse"
          style={{ background: 'var(--accent)' }}
        />
        <span className="text-xs">
          {currentStatusLabel(blocks)}
          {elapsed > 0 && (
            <span className="ml-1.5" style={{ opacity: 0.6 }}>{elapsed.toFixed(1)}s</span>
          )}
        </span>
      </div>
    )
  }

  // ── Done: collapsed summary + expandable details ───────────────────────────
  const summary = summaryLabel(blocks)
  if (!summary) return null

  // Build tool pairs for expanded view
  const resultMap = new Map(
    blocks
      .filter((b) => b.type === 'tool_result')
      .map((b) => {
        const tr = b as { type: 'tool_result'; tool_use_id: string; content: string }
        return [tr.tool_use_id, tr.content]
      })
  )
  const toolUses = blocks.filter((b) => b.type === 'tool_use') as Array<{
    type: 'tool_use'
    id: string
    name: string
    input: unknown
  }>
  const thinkingBlocks = blocks.filter((b) => b.type === 'thinking') as Array<{
    type: 'thinking'
    thinking: string
  }>

  return (
    <div className="my-1.5">
      {/* Summary toggle row */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-1.5 text-xs py-0.5 hover:opacity-100 transition-opacity"
        style={{ color: 'var(--muted)', opacity: 0.7 }}
      >
        <ChevronRight
          size={11}
          style={{
            transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
            transition: 'transform 0.15s'
          }}
        />
        <span>{summary}</span>
      </button>

      {/* Expanded details */}
      {expanded && (
        <div
          className="mt-1.5 ml-3 pl-3 space-y-2 text-xs"
          style={{ borderLeft: '1px solid var(--border)' }}
        >
          {/* Thinking blocks */}
          {thinkingBlocks.map((b, i) => (
            <div key={`thinking-${i}`}>
              <div className="flex items-center gap-1.5 mb-0.5" style={{ color: 'var(--muted)' }}>
                <Brain size={11} />
                <span className="font-medium">thinking</span>
              </div>
              <div
                className="font-mono text-xs leading-relaxed line-clamp-3"
                style={{ color: 'var(--muted)' }}
              >
                {b.thinking.slice(0, 200)}
                {b.thinking.length > 200 ? '…' : ''}
              </div>
            </div>
          ))}

          {/* Tool calls */}
          {toolUses.map((tu) => {
            const result = resultMap.get(tu.id)
            const inp = tu.input as Record<string, string>
            const inputStr =
              tu.name === 'web_search'
                ? inp.query
                : tu.name === 'browse_url'
                  ? inp.url
                  : tu.name === 'get_weather'
                    ? inp.location
                    : JSON.stringify(tu.input)

            const resultPreview = result
              ? result.slice(0, 120) + (result.length > 120 ? '…' : '')
              : '(pending)'

            return (
              <div key={tu.id}>
                <div className="flex items-center gap-1.5 mb-0.5" style={{ color: 'var(--muted)' }}>
                  {toolIcon(tu.name)}
                  <span className="font-medium">{tu.name}</span>
                  {inputStr && (
                    <span
                      className="font-mono truncate max-w-[240px]"
                      style={{ color: 'var(--text)', opacity: 0.6 }}
                    >
                      {inputStr.slice(0, 60)}
                    </span>
                  )}
                </div>
                <div className="font-mono leading-relaxed" style={{ color: 'var(--muted)', opacity: 0.7 }}>
                  {resultPreview}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
