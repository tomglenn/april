import { useEffect, useRef, useState, useMemo } from 'react'
import Fuse from 'fuse.js'
import { MessageSquare, Pencil, Trash2, Clipboard, Sun, Moon, Monitor, Briefcase, Smile, Sparkles, Zap, Cpu, Star, RotateCcw } from 'lucide-react'
import { useConversationsStore } from '../stores/conversations'
import { useSettingsStore } from '../stores/settings'
import { MODEL_CATALOG } from '../models'
import type { Provider } from '../types'

const PERSONALITY_PROMPTS = {
  professional: 'Communicate formally and precisely. Keep responses well-structured and focused on the task. Avoid small talk.',
  friendly: 'Communicate warmly and conversationally. Be encouraging and personable.',
  creative: 'Bring imagination and enthusiasm to everything. Think expansively and embrace creative exploration.',
  concise: 'Always be brief. Get to the point immediately. Use as few words as possible while remaining accurate.'
}

interface PaletteCommand {
  id: string
  label: string
  category: string
  icon: React.ElementType
  keywords?: string[]
  badge?: string
  action: () => void
  prompt?: {
    label: string
    placeholder: string
    defaultValue: string
    onSubmit: (value: string) => void
  }
}

interface PromptState {
  label: string
  placeholder: string
  value: string
  onSubmit: (value: string) => void
}

interface ConvItem {
  id: string
  title: string
  content: string
  updatedAt: number
}

type NavItem = { type: 'command'; cmd: PaletteCommand } | { type: 'conv'; conv: ConvItem }

interface Props {
  onClose: () => void
}

export function CommandPalette({ onClose }: Props): JSX.Element {
  const { conversations, activeId, setActiveId, deleteConv, renameConv, setConversationModel, clearConversationModel } = useConversationsStore()
  const { settings, update } = useSettingsStore()

  const [query, setQuery] = useState('')
  const [selectedIdx, setSelectedIdx] = useState(0)
  const [promptState, setPromptState] = useState<PromptState | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // Keep onClose stable in closures
  const onCloseRef = useRef(onClose)
  useEffect(() => { onCloseRef.current = onClose }, [onClose])

  const activeConv = useMemo(() => conversations.find(c => c.id === activeId) ?? null, [conversations, activeId])

  const convItems: ConvItem[] = useMemo(() =>
    conversations.map(c => ({
      id: c.id,
      title: c.title,
      content: c.messages
        .flatMap(m => m.blocks)
        .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
        .map(b => b.text)
        .join(' '),
      updatedAt: c.updatedAt
    })),
    [conversations]
  )

  const activePersonality = useMemo(() => {
    if (!settings) return null
    for (const [id, text] of Object.entries(PERSONALITY_PROMPTS)) {
      if (settings.personalityPrompt === text) return id
    }
    return null
  }, [settings?.personalityPrompt])

  const commands: PaletteCommand[] = useMemo(() => {
    if (!settings) return []
    const cmds: PaletteCommand[] = []

    // Conversation commands (only when active)
    if (activeId && activeConv) {
      const convTitle = activeConv.title
      const convMessages = activeConv.messages
      cmds.push({
        id: 'conv-rename',
        label: 'Rename conversation',
        category: 'Conversation',
        icon: Pencil,
        keywords: ['rename', 'title', 'name'],
        action: () => {},
        prompt: {
          label: 'Rename:',
          placeholder: 'New title…',
          defaultValue: convTitle,
          onSubmit: (title) => {
            renameConv(activeId, title)
            onCloseRef.current()
          }
        }
      })
      cmds.push({
        id: 'conv-delete',
        label: 'Delete conversation',
        category: 'Conversation',
        icon: Trash2,
        keywords: ['delete', 'remove', 'trash'],
        action: () => {
          deleteConv(activeId)
          onCloseRef.current()
        }
      })
      cmds.push({
        id: 'conv-copy',
        label: 'Copy to clipboard',
        category: 'Conversation',
        icon: Clipboard,
        keywords: ['copy', 'clipboard', 'export'],
        action: () => {
          const text = convMessages
            .map(m => {
              const role = m.role === 'user' ? 'You' : 'Assistant'
              const content = m.blocks
                .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
                .map(b => b.text)
                .join('\n')
              return `${role}:\n${content}`
            })
            .join('\n\n')
          navigator.clipboard.writeText(text)
          onCloseRef.current()
        }
      })
    }

    // Theme commands
    const themes: { id: 'dark' | 'light' | 'system'; label: string; icon: React.ElementType }[] = [
      { id: 'dark', label: 'Set theme to Dark', icon: Moon },
      { id: 'light', label: 'Set theme to Light', icon: Sun },
      { id: 'system', label: 'Set theme to System', icon: Monitor }
    ]
    for (const t of themes) {
      cmds.push({
        id: `theme-${t.id}`,
        label: t.label,
        category: 'Theme',
        icon: t.icon,
        keywords: ['theme', 'appearance', 'color', t.id],
        badge: settings.theme === t.id ? '✓' : undefined,
        action: () => {
          update({ theme: t.id })
          onCloseRef.current()
        }
      })
    }

    // Personality commands
    const personalities: { id: keyof typeof PERSONALITY_PROMPTS; label: string; icon: React.ElementType }[] = [
      { id: 'professional', label: 'Set style to Professional', icon: Briefcase },
      { id: 'friendly', label: 'Set style to Friendly', icon: Smile },
      { id: 'creative', label: 'Set style to Creative', icon: Sparkles },
      { id: 'concise', label: 'Set style to Concise', icon: Zap }
    ]
    for (const p of personalities) {
      cmds.push({
        id: `personality-${p.id}`,
        label: p.label,
        category: 'Personality',
        icon: p.icon,
        keywords: ['personality', 'style', 'tone', p.id],
        badge: activePersonality === p.id ? '✓' : undefined,
        action: () => {
          update({ personalityPrompt: PERSONALITY_PROMPTS[p.id] })
          onCloseRef.current()
        }
      })
    }

    // Model commands — set the model for the current conversation
    const effectiveModel = activeConv?.model ?? settings.defaultModel
    const effectiveProvider = activeConv?.provider ?? settings.defaultProvider
    for (const m of MODEL_CATALOG) {
      const hasKey =
        m.provider === 'anthropic' ? !!settings.anthropicApiKey :
        m.provider === 'openai' ? !!settings.openaiApiKey :
        false
      if (!hasKey) continue
      const isActive = effectiveModel === m.model && effectiveProvider === m.provider
      cmds.push({
        id: `model-${m.id}`,
        label: `Switch to ${m.label}`,
        category: 'Model',
        icon: Cpu,
        keywords: ['model', 'ai', m.label.toLowerCase(), m.provider],
        badge: isActive ? '✓' : undefined,
        action: () => {
          if (activeId) setConversationModel(activeId, m.model, m.provider)
          onCloseRef.current()
        }
      })
    }
    if (settings.ollamaBaseUrl) {
      const ollamaModel = effectiveProvider === 'ollama' ? effectiveModel : 'llama3.2'
      const isActive = effectiveProvider === 'ollama'
      cmds.push({
        id: 'model-ollama',
        label: `Switch to Ollama (${ollamaModel})`,
        category: 'Model',
        icon: Cpu,
        keywords: ['model', 'ollama', 'local', ollamaModel],
        badge: isActive ? '✓' : undefined,
        action: () => {
          if (activeId) setConversationModel(activeId, ollamaModel, 'ollama' as Provider)
          onCloseRef.current()
        }
      })
    }
    // Override management — only shown when there's a conversation-level override
    if (activeId && activeConv?.model) {
      cmds.push({
        id: 'model-set-default',
        label: 'Set current model as default',
        category: 'Model',
        icon: Star,
        keywords: ['default', 'save', 'model', 'global'],
        action: () => {
          update({ defaultModel: activeConv.model!, defaultProvider: activeConv.provider ?? settings.defaultProvider })
          onCloseRef.current()
        }
      })
      cmds.push({
        id: 'model-reset-default',
        label: 'Reset to default model',
        category: 'Model',
        icon: RotateCcw,
        keywords: ['reset', 'default', 'model', 'unpin', 'clear'],
        action: () => {
          clearConversationModel(activeId)
          onCloseRef.current()
        }
      })
    }

    return cmds
  }, [settings, activeId, activeConv, activePersonality, update, deleteConv, renameConv, setConversationModel, clearConversationModel])

  // Fuse instances
  const commandFuse = useMemo(() => new Fuse(commands, {
    keys: [{ name: 'label', weight: 2 }, { name: 'keywords', weight: 1 }],
    threshold: 0.35,
    ignoreLocation: true
  }), [commands])

  const convFuse = useMemo(() => new Fuse(convItems, {
    keys: [{ name: 'title', weight: 2 }, { name: 'content', weight: 1 }],
    threshold: 0.4,
    ignoreLocation: true,
    minMatchCharLength: 2
  }), [convItems])

  // Browse mode groups
  const browseGroups = useMemo(() => {
    const recent = [...convItems].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 5)
    const groups: { label: string; items: NavItem[] }[] = []
    if (recent.length > 0) {
      groups.push({ label: 'Recent', items: recent.map(c => ({ type: 'conv' as const, conv: c })) })
    }
    const categoryOrder = ['Conversation', 'Theme', 'Personality', 'Model']
    for (const cat of categoryOrder) {
      const catCmds = commands.filter(c => c.category === cat)
      if (catCmds.length > 0) {
        groups.push({ label: cat, items: catCmds.map(cmd => ({ type: 'command' as const, cmd })) })
      }
    }
    return groups
  }, [convItems, commands])

  // Search results
  const searchResults: NavItem[] | null = useMemo(() => {
    if (!query.trim()) return null
    const matchedCmds = commandFuse.search(query).map(r => ({ type: 'command' as const, cmd: r.item }))
    const matchedConvs = convFuse.search(query).map(r => ({ type: 'conv' as const, conv: r.item }))
    return [...matchedCmds, ...matchedConvs]
  }, [query, commandFuse, convFuse])

  // Flat navigable items
  const navigableItems: NavItem[] = useMemo(() => {
    if (searchResults) return searchResults
    return browseGroups.flatMap(g => g.items)
  }, [searchResults, browseGroups])

  useEffect(() => { setSelectedIdx(0) }, [query])
  useEffect(() => { inputRef.current?.focus() }, [])

  useEffect(() => {
    const list = listRef.current
    if (!list) return
    const items = list.querySelectorAll<HTMLElement>('[data-nav-item]')
    items[selectedIdx]?.scrollIntoView({ block: 'nearest' })
  }, [selectedIdx])

  const executeItem = (item: NavItem): void => {
    if (item.type === 'conv') {
      setActiveId(item.conv.id)
      onCloseRef.current()
    } else {
      const cmd = item.cmd
      if (cmd.prompt) {
        setPromptState({
          label: cmd.prompt.label,
          placeholder: cmd.prompt.placeholder,
          value: cmd.prompt.defaultValue,
          onSubmit: cmd.prompt.onSubmit
        })
        // Focus the input (it's already focused, but ensure the value is selected)
        setTimeout(() => {
          const input = inputRef.current
          if (input) { input.select() }
        }, 0)
      } else {
        cmd.action()
      }
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if (promptState) {
      if (e.key === 'Enter') {
        e.preventDefault()
        promptState.onSubmit(promptState.value)
      } else if (e.key === 'Escape') {
        e.preventDefault()
        setPromptState(null)
      }
      return
    }
    if (e.key === 'Escape') {
      onClose()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIdx(i => Math.min(i + 1, navigableItems.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIdx(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const item = navigableItems[selectedIdx]
      if (item) executeItem(item)
    }
  }

  const getSnippet = (convId: string): string | null => {
    if (!query.trim()) return null
    const conv = conversations.find(c => c.id === convId)
    if (!conv) return null
    const q = query.toLowerCase()
    for (const msg of conv.messages) {
      for (const block of msg.blocks) {
        if (block.type === 'text') {
          const lower = block.text.toLowerCase()
          const idx = lower.indexOf(q)
          if (idx >= 0) {
            const start = Math.max(0, idx - 30)
            const end = Math.min(block.text.length, idx + 60)
            return (start > 0 ? '…' : '') + block.text.slice(start, end) + (end < block.text.length ? '…' : '')
          }
        }
      }
    }
    return null
  }

  const renderNavItem = (item: NavItem, idx: number): JSX.Element => {
    const isSelected = idx === selectedIdx
    const style = {
      background: isSelected ? 'var(--bg)' : 'transparent',
      borderLeft: isSelected ? '2px solid var(--accent)' : '2px solid transparent'
    }
    if (item.type === 'conv') {
      const snippet = getSnippet(item.conv.id)
      return (
        <div
          key={item.conv.id}
          data-nav-item=""
          onClick={() => executeItem(item)}
          onMouseEnter={() => setSelectedIdx(idx)}
          className="px-4 py-2.5 cursor-pointer flex items-center gap-3"
          style={style}
        >
          <MessageSquare size={14} style={{ color: 'var(--muted)', flexShrink: 0, marginTop: snippet ? 2 : 0 }} />
          <div className="min-w-0">
            <div className="text-sm truncate" style={{ color: 'var(--text)' }}>{item.conv.title}</div>
            {snippet && (
              <div className="text-xs truncate mt-0.5" style={{ color: 'var(--muted)' }}>{snippet}</div>
            )}
          </div>
        </div>
      )
    }
    const Icon = item.cmd.icon
    return (
      <div
        key={item.cmd.id}
        data-nav-item=""
        onClick={() => executeItem(item)}
        onMouseEnter={() => setSelectedIdx(idx)}
        className="px-4 py-2.5 cursor-pointer flex items-center gap-3"
        style={style}
      >
        <Icon size={14} style={{ color: 'var(--muted)', flexShrink: 0 }} />
        <span className="text-sm flex-1 truncate" style={{ color: 'var(--text)' }}>{item.cmd.label}</span>
        {item.cmd.badge && (
          <span className="text-xs font-medium" style={{ color: 'var(--accent)' }}>{item.cmd.badge}</span>
        )}
      </div>
    )
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
        {/* Input area */}
        <div className="flex items-center" style={{ borderBottom: '1px solid var(--border)' }}>
          {promptState && (
            <span className="pl-4 text-xs font-medium shrink-0" style={{ color: 'var(--muted)' }}>
              {promptState.label}
            </span>
          )}
          <input
            ref={inputRef}
            value={promptState ? promptState.value : query}
            onChange={(e) => {
              if (promptState) {
                setPromptState(s => s ? { ...s, value: e.target.value } : s)
              } else {
                setQuery(e.target.value)
              }
            }}
            onKeyDown={handleKeyDown}
            placeholder={promptState ? promptState.placeholder : 'Search commands and conversations…'}
            className="w-full px-4 py-3 text-sm outline-none"
            style={{ background: 'transparent', color: 'var(--text)' }}
          />
        </div>

        {/* Body */}
        {promptState ? (
          <div className="px-4 py-3 text-xs" style={{ color: 'var(--muted)' }}>
            Press Enter to confirm · Escape to cancel
          </div>
        ) : (
          <div ref={listRef} className="overflow-y-auto" style={{ maxHeight: '400px' }}>
            {navigableItems.length === 0 ? (
              <div className="px-4 py-3 text-sm" style={{ color: 'var(--muted)' }}>
                No results found
              </div>
            ) : searchResults ? (
              // Search mode: flat ranked results
              navigableItems.map((item, i) => renderNavItem(item, i))
            ) : (
              // Browse mode: grouped
              (() => {
                let navIdx = 0
                return browseGroups.map(group => (
                  <div key={group.label}>
                    <div
                      className="px-4 py-1 text-xs font-semibold uppercase tracking-wide"
                      style={{ color: 'var(--muted)', opacity: 0.5 }}
                    >
                      {group.label}
                    </div>
                    {group.items.map(item => {
                      const idx = navIdx++
                      return renderNavItem(item, idx)
                    })}
                  </div>
                ))
              })()
            )}
          </div>
        )}
      </div>
    </div>
  )
}
