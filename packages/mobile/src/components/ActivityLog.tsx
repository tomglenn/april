import React, { useState, useRef, useEffect } from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import { ChevronRight, Search, Globe, CloudSun, Wrench, Brain, Image as ImageIcon } from 'lucide-react-native'
import { useTheme } from '../theme/ThemeProvider'
import type { ContentBlock } from '@april/core'

interface Props {
  blocks: ContentBlock[]
  isStreaming: boolean
}

function friendlyToolLabel(name: string): string {
  const match = name.match(/^mcp__(\w+)__(.+)$/)
  if (!match) return name
  const [, server, tool] = match
  if (server === 'Memory') {
    const labels: Record<string, string> = {
      read_graph: 'recalled memory', search_nodes: 'searched memory',
      create_entities: 'remembered', add_observations: 'updated memory',
      delete_entities: 'forgot', open_nodes: 'opened memory'
    }
    if (labels[tool]) return labels[tool]
  }
  return `${tool.replace(/_/g, ' ')} (${server})`
}

function ToolIcon({ name }: { name: string }): JSX.Element {
  const colors = useTheme()
  const size = 11
  const color = colors.muted
  switch (name) {
    case 'web_search': return <Search size={size} color={color} />
    case 'browse_url': return <Globe size={size} color={color} />
    case 'get_weather': return <CloudSun size={size} color={color} />
    case 'generate_image': return <ImageIcon size={size} color={color} />
    default: {
      const mcp = name.match(/^mcp__(\w+)__/)
      if (mcp?.[1] === 'Memory') return <Brain size={size} color={color} />
      return <Wrench size={size} color={color} />
    }
  }
}

function currentStatusLabel(blocks: ContentBlock[]): string {
  const resultedIds = new Set(
    blocks.filter((b) => b.type === 'tool_result')
      .map((b) => (b as { type: 'tool_result'; tool_use_id: string }).tool_use_id)
  )
  for (let i = blocks.length - 1; i >= 0; i--) {
    const b = blocks[i]
    if (b.type === 'thinking') return 'Thinking...'
    if (b.type === 'tool_use' && !resultedIds.has(b.id)) {
      const inp = b.input as Record<string, string>
      switch (b.name) {
        case 'web_search': return inp.query ? `Searching "${inp.query.slice(0, 48)}"...` : 'Searching...'
        case 'browse_url': {
          try { return `Browsing ${new URL(inp.url).hostname.replace(/^www\./, '')}...` }
          catch { return 'Browsing page...' }
        }
        case 'get_weather': return inp.location ? `Checking weather in ${inp.location}...` : 'Checking weather...'
        case 'generate_image': return 'Generating image...'
        default: return `Running ${friendlyToolLabel(b.name)}...`
      }
    }
    if (b.type === 'tool_result') return 'Working...'
  }
  return 'Working...'
}

function summaryLabel(blocks: ContentBlock[]): string {
  const toolUses = blocks.filter((b) => b.type === 'tool_use') as Array<{ type: 'tool_use'; name: string }>
  const hasThinking = blocks.some((b) => b.type === 'thinking')
  const counts: Record<string, number> = {}
  for (const t of toolUses) counts[t.name] = (counts[t.name] ?? 0) + 1

  const parts: string[] = []
  if (hasThinking) parts.push('thought')
  for (const [name, n] of Object.entries(counts)) {
    switch (name) {
      case 'web_search': parts.push(n === 1 ? 'searched' : `searched ${n}x`); break
      case 'browse_url': parts.push(n === 1 ? 'browsed a page' : `browsed ${n} pages`); break
      case 'get_weather': parts.push('checked weather'); break
      case 'generate_image': parts.push(n === 1 ? 'generated image' : `generated ${n} images`); break
      default: {
        const label = friendlyToolLabel(name)
        parts.push(n === 1 ? label : `${label} ${n}x`)
      }
    }
  }
  return parts.join(' \u00b7 ')
}

export function ActivityLog({ blocks, isStreaming }: Props): JSX.Element | null {
  const colors = useTheme()
  const [expanded, setExpanded] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const startTimeRef = useRef(Date.now())
  const currentToolIdRef = useRef<string | null>(null)

  useEffect(() => {
    if (!isStreaming) {
      setElapsed(0)
      currentToolIdRef.current = null
      return
    }
    const resultedIds = new Set(
      blocks.filter((b) => b.type === 'tool_result')
        .map((b) => (b as { type: 'tool_result'; tool_use_id: string }).tool_use_id)
    )
    let activeId: string | null = null
    for (let i = blocks.length - 1; i >= 0; i--) {
      const b = blocks[i]
      if (b.type === 'tool_use' && !resultedIds.has(b.id)) { activeId = b.id; break }
    }
    if (activeId !== currentToolIdRef.current) {
      currentToolIdRef.current = activeId
      startTimeRef.current = Date.now()
      setElapsed(0)
    }
    if (!activeId) return
    const interval = setInterval(() => setElapsed((Date.now() - startTimeRef.current) / 1000), 100)
    return () => clearInterval(interval)
  }, [isStreaming, blocks])

  if (blocks.length === 0) return null

  if (isStreaming) {
    return (
      <View style={styles.statusRow}>
        <View style={[styles.pulseDot, { backgroundColor: colors.accent }]} />
        <Text style={{ color: colors.muted, fontSize: 12 }}>
          {currentStatusLabel(blocks)}
          {elapsed > 0 && <Text style={{ opacity: 0.6 }}> {elapsed.toFixed(1)}s</Text>}
        </Text>
      </View>
    )
  }

  const summary = summaryLabel(blocks)
  if (!summary) return null

  const toolUses = blocks.filter((b) => b.type === 'tool_use') as Array<{
    type: 'tool_use'; id: string; name: string; input: unknown
  }>
  const resultMap = new Map(
    blocks.filter((b) => b.type === 'tool_result')
      .map((b) => {
        const tr = b as { type: 'tool_result'; tool_use_id: string; content: string }
        return [tr.tool_use_id, tr.content] as [string, string]
      })
  )

  return (
    <View style={styles.logContainer}>
      <Pressable onPress={() => setExpanded((v) => !v)} style={styles.summaryRow}>
        <View style={{ transform: [{ rotate: expanded ? '90deg' : '0deg' }] }}>
          <ChevronRight size={11} color={colors.muted} />
        </View>
        <Text style={{ color: colors.muted, fontSize: 12, opacity: 0.7 }}>{summary}</Text>
      </Pressable>

      {expanded && (
        <View style={[styles.details, { borderLeftColor: colors.border }]}>
          {toolUses.map((tu) => {
            const inp = tu.input as Record<string, string>
            const inputStr = tu.name === 'web_search' ? inp.query
              : tu.name === 'browse_url' ? inp.url
              : tu.name === 'get_weather' ? inp.location
              : JSON.stringify(tu.input)
            const result = resultMap.get(tu.id)
            return (
              <View key={tu.id} style={styles.toolEntry}>
                <View style={styles.toolHeader}>
                  <ToolIcon name={tu.name} />
                  <Text style={{ color: colors.muted, fontSize: 11, fontWeight: '600', flexShrink: 0 }}>
                    {friendlyToolLabel(tu.name)}
                  </Text>
                </View>
                {inputStr && (
                  <Text style={{ color: colors.text, fontSize: 11, opacity: 0.6 }}>
                    {inputStr}
                  </Text>
                )}
                {result && (
                  <Text style={{ color: colors.muted, fontSize: 11, opacity: 0.7 }}>
                    {result}
                  </Text>
                )}
              </View>
            )
          })}
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4
  },
  pulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3
  },
  logContainer: {
    marginVertical: 4
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 2
  },
  details: {
    marginTop: 6,
    marginLeft: 12,
    paddingLeft: 12,
    borderLeftWidth: 1,
    gap: 8
  },
  toolEntry: {
    gap: 2
  },
  toolHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  }
})
