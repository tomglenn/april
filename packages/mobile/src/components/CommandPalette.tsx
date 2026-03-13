import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  View,
  Text,
  TextInput,
  FlatList,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  Keyboard,
  Platform,
  Alert
} from 'react-native'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing
} from 'react-native-reanimated'
import * as Clipboard from 'expo-clipboard'
import Fuse from 'fuse.js'
import {
  MessageSquare,
  Pencil,
  Trash2,
  Clipboard as ClipboardIcon,
  Sun,
  Moon,
  Monitor,
  Briefcase,
  Smile,
  Sparkles,
  Zap,
  Cpu,
  Star,
  RotateCcw,
  X
} from 'lucide-react-native'
import { useConversationsStore } from '../stores/conversations'
import { useSettingsStore } from '../stores/settings'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTheme } from '../theme/ThemeProvider'
import { MODEL_CATALOG } from '../models'
import type { Provider } from '@april/core'

const PERSONALITY_PROMPTS = {
  professional: 'Communicate formally and precisely. Keep responses well-structured and focused on the task. Avoid small talk.',
  friendly: 'Communicate warmly and conversationally. Be encouraging and personable.',
  creative: 'Bring imagination and enthusiasm to everything. Think expansively and embrace creative exploration.',
  concise: 'Always be brief. Get to the point immediately. Use as few words as possible while remaining accurate.'
}

type IconComponent = React.ComponentType<{ size?: number; color?: string }>

interface PaletteCommand {
  id: string
  label: string
  category: string
  icon: IconComponent
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

type NavItem =
  | { type: 'command'; cmd: PaletteCommand }
  | { type: 'conv'; conv: ConvItem; snippet: string | null }

type ListItem =
  | { key: string; type: 'header'; label: string }
  | { key: string; type: 'command'; cmd: PaletteCommand }
  | { key: string; type: 'conv'; conv: ConvItem; snippet: string | null }

/** Plain function — no hook overhead, safe to call inside useMemo */
function findSnippet(conv: { messages: { blocks: { type: string; text?: string }[] }[] }, q: string): string | null {
  const lower = q.toLowerCase()
  for (const msg of conv.messages) {
    for (const block of msg.blocks) {
      if (block.type === 'text' && block.text) {
        const idx = block.text.toLowerCase().indexOf(lower)
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

interface Props {
  isOpen: boolean
  onClose: () => void
}

export function CommandPalette({ isOpen, onClose }: Props): JSX.Element {
  const {
    conversations, activeId, setActiveId,
    deleteConv, renameConv, setConversationModel, clearConversationModel
  } = useConversationsStore()
  const { settings, update } = useSettingsStore()
  const colors = useTheme()
  const { height } = useWindowDimensions()
  const insets = useSafeAreaInsets()
  const HEADER_HEIGHT = 48
  // Panel sits just below the header; 45% screen height is plenty for a command list
  const panelHeight = Math.round(height * 0.45)
  // Large constant: guarantees panel is fully off-screen regardless of device insets
  const CLOSE_Y = -1000

  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [promptState, setPromptState] = useState<PromptState | null>(null)
  const inputRef = useRef<TextInput>(null)
  const listRef = useRef<FlatList>(null)
  const onCloseRef = useRef(onClose)
  useEffect(() => { onCloseRef.current = onClose }, [onClose])

  // Debounce query so Fuse doesn't run on every keypress, which causes
  // re-renders mid-tap that eat touches and require double-tapping
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 120)
    return () => clearTimeout(timer)
  }, [query])

  // Scroll to top whenever search results change so the best match is always visible
  useEffect(() => {
    listRef.current?.scrollToOffset({ offset: 0, animated: false })
  }, [debouncedQuery])

  // Shared values for slide + height animations
  const translateY = useSharedValue(CLOSE_Y)
  const panelHeightSv = useSharedValue(panelHeight)
  const backdropOpacity = useSharedValue(0)

  useEffect(() => {
    if (isOpen) {
      translateY.value = withTiming(0, { duration: 200, easing: Easing.out(Easing.cubic) })
      backdropOpacity.value = withTiming(0.4, { duration: 150 })
      setTimeout(() => inputRef.current?.focus(), 100)
    } else {
      translateY.value = withTiming(CLOSE_Y, { duration: 160, easing: Easing.in(Easing.cubic) })
      backdropOpacity.value = withTiming(0, { duration: 150 })
    }
  }, [isOpen])

  // Animate panel height in sync with keyboard
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow'
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide'
    const onShow = Keyboard.addListener(showEvent, (e) => {
      const available = height - (insets.top + HEADER_HEIGHT) - e.endCoordinates.height - 8
      panelHeightSv.value = withTiming(Math.min(panelHeight, available), {
        duration: Platform.OS === 'ios' ? (e.duration ?? 250) : 250
      })
    })
    const onHide = Keyboard.addListener(hideEvent, () => {
      panelHeightSv.value = withTiming(panelHeight, { duration: 250 })
    })
    return () => { onShow.remove(); onHide.remove() }
  }, [height, insets.top, panelHeight])

  // Reset state on close
  useEffect(() => {
    if (!isOpen) {
      setQuery('')
      setDebouncedQuery('')
      setPromptState(null)
    }
  }, [isOpen])

  // Combined panel animated style: slide-in + height
  const panelStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    height: panelHeightSv.value
  }))

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value
  }))


  const activeConv = useMemo(
    () => conversations.find(c => c.id === activeId) ?? null,
    [conversations, activeId]
  )

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

    // Conversation commands (only when there's an active conversation)
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
          Alert.alert('Delete conversation', 'This cannot be undone.', [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Delete',
              style: 'destructive',
              onPress: () => {
                deleteConv(activeId)
                onCloseRef.current()
              }
            }
          ])
        }
      })
      cmds.push({
        id: 'conv-copy',
        label: 'Copy to clipboard',
        category: 'Conversation',
        icon: ClipboardIcon,
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
          Clipboard.setStringAsync(text).catch(() => {})
          onCloseRef.current()
        }
      })
    }

    // Theme commands
    const themeOptions: { id: 'dark' | 'light' | 'system'; label: string; icon: IconComponent }[] = [
      { id: 'dark', label: 'Set theme to Dark', icon: Moon },
      { id: 'light', label: 'Set theme to Light', icon: Sun },
      { id: 'system', label: 'Set theme to System', icon: Monitor }
    ]
    for (const t of themeOptions) {
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
    const personalityOptions: { id: keyof typeof PERSONALITY_PROMPTS; label: string; icon: IconComponent }[] = [
      { id: 'professional', label: 'Set style to Professional', icon: Briefcase },
      { id: 'friendly', label: 'Set style to Friendly', icon: Smile },
      { id: 'creative', label: 'Set style to Creative', icon: Sparkles },
      { id: 'concise', label: 'Set style to Concise', icon: Zap }
    ]
    for (const p of personalityOptions) {
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

    // Model commands
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

  const commandFuse = useMemo(() => new Fuse(commands, {
    keys: [{ name: 'label', weight: 2 }, { name: 'keywords', weight: 1 }],
    threshold: 0.35,
    ignoreLocation: true
  }), [commands])

  // Truncated content for Fuse — mobile JS engines are ~5-10x slower than desktop V8,
  // so cap what Fuse has to fuzzy-match. Snippets use full messages via findSnippet().
  const convFuseItems = useMemo(() =>
    convItems.map(c => ({ ...c, content: c.content.slice(0, 1000) })),
    [convItems]
  )

  const convFuse = useMemo(() => new Fuse(convFuseItems, {
    keys: [{ name: 'title', weight: 2 }, { name: 'content', weight: 1 }],
    threshold: 0.4,
    ignoreLocation: true,
    minMatchCharLength: 2
  }), [convFuseItems])

  const browseGroups = useMemo(() => {
    const recent = [...convItems].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 5)
    const groups: { label: string; items: NavItem[] }[] = []
    if (recent.length > 0) {
      groups.push({ label: 'Recent', items: recent.map(c => ({ type: 'conv' as const, conv: c, snippet: null })) })
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

  const searchResults: NavItem[] | null = useMemo(() => {
    if (!debouncedQuery.trim()) return null
    const q = debouncedQuery
    const matchedCmds = commandFuse.search(q).map(r => ({ type: 'command' as const, cmd: r.item }))
    // Look up full conversation for snippet — convFuse item has same id
    const matchedConvs = convFuse.search(q).map(r => {
      const fullConv = conversations.find(c => c.id === r.item.id)
      const snippet = fullConv ? findSnippet(fullConv, q) : null
      return { type: 'conv' as const, conv: r.item, snippet }
    })
    return [...matchedCmds, ...matchedConvs]
  }, [debouncedQuery, commandFuse, convFuse, conversations])

  const listData: ListItem[] = useMemo(() => {
    if (searchResults) {
      return searchResults.map((item, i) =>
        item.type === 'command'
          ? { key: `cmd-${item.cmd.id}`, type: 'command' as const, cmd: item.cmd }
          : { key: `conv-${item.conv.id}-${i}`, type: 'conv' as const, conv: item.conv, snippet: item.snippet }
      )
    }
    const items: ListItem[] = []
    for (const group of browseGroups) {
      items.push({ key: `header-${group.label}`, type: 'header' as const, label: group.label })
      for (const navItem of group.items) {
        if (navItem.type === 'command') {
          items.push({ key: `cmd-${navItem.cmd.id}`, type: 'command' as const, cmd: navItem.cmd })
        } else {
          items.push({ key: `conv-${navItem.conv.id}`, type: 'conv' as const, conv: navItem.conv, snippet: navItem.snippet })
        }
      }
    }
    return items
  }, [searchResults, browseGroups])

  const executeCommand = useCallback((cmd: PaletteCommand) => {
    if (cmd.prompt) {
      setQuery('')
      setPromptState({
        label: cmd.prompt.label,
        placeholder: cmd.prompt.placeholder,
        value: cmd.prompt.defaultValue,
        onSubmit: cmd.prompt.onSubmit
      })
    } else {
      cmd.action()
    }
  }, [])

  const renderItem = useCallback(({ item }: { item: ListItem }) => {
    if (item.type === 'header') {
      return (
        <Text style={[styles.sectionHeader, { color: colors.muted }]}>
          {item.label.toUpperCase()}
        </Text>
      )
    }
    if (item.type === 'conv') {
      const snippet = item.snippet
      return (
        <Pressable
          style={({ pressed }) => [styles.row, { borderBottomColor: colors.border, backgroundColor: pressed ? colors.surfaceAlt : 'transparent' }]}
          onPress={() => {
            setActiveId(item.conv.id)
            onCloseRef.current()
          }}
        >
          <MessageSquare size={16} color={colors.muted} style={{ marginTop: snippet ? 2 : 0 }} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[styles.rowLabel, { color: colors.text }]} numberOfLines={1}>
              {item.conv.title}
            </Text>
            {snippet && (
              <Text style={[styles.snippet, { color: colors.muted }]} numberOfLines={1}>
                {snippet}
              </Text>
            )}
          </View>
        </Pressable>
      )
    }
    const Icon = item.cmd.icon
    return (
      <Pressable
        style={({ pressed }) => [styles.row, { borderBottomColor: colors.border, backgroundColor: pressed ? colors.surfaceAlt : 'transparent' }]}
        onPress={() => executeCommand(item.cmd)}
      >
        <Icon size={16} color={colors.muted} />
        <Text style={[styles.rowLabel, { color: colors.text }]} numberOfLines={1}>
          {item.cmd.label}
        </Text>
        {item.cmd.badge && (
          <Text style={[styles.badge, { color: colors.accent }]}>{item.cmd.badge}</Text>
        )}
      </Pressable>
    )
  }, [colors, executeCommand, setActiveId])

  return (
    <View style={[StyleSheet.absoluteFill, styles.overlay]} pointerEvents={isOpen ? 'auto' : 'none'}>
      {/* Backdrop */}
      <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, backdropStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>

      {/* Panel */}
      <Animated.View
          style={[
            styles.panel,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              top: insets.top + HEADER_HEIGHT
            },
            panelStyle
          ]}
        >
          {/* Input area */}
          <View style={[styles.inputRow, { borderBottomColor: colors.border }]}>
            {promptState && (
              <Text style={[styles.promptLabel, { color: colors.muted }]}>{promptState.label}</Text>
            )}
            <TextInput
              ref={inputRef}
              value={promptState ? promptState.value : query}
              onChangeText={(text) => {
                if (promptState) {
                  setPromptState(s => s ? { ...s, value: text } : s)
                } else {
                  setQuery(text)
                }
              }}
              onSubmitEditing={() => {
                if (promptState) promptState.onSubmit(promptState.value)
              }}
              placeholder={promptState ? promptState.placeholder : 'Search commands and conversations…'}
              placeholderTextColor={colors.muted}
              style={[styles.input, { color: colors.text }]}
              autoCorrect={false}
              autoCapitalize="none"
              returnKeyType={promptState ? 'done' : 'search'}
              blurOnSubmit={false}
            />
            <Pressable onPress={onClose} style={styles.closeButton} hitSlop={8}>
              <X size={18} color={colors.muted} />
            </Pressable>
          </View>

          {/* Body */}
          {promptState ? (
            <View style={styles.promptHint}>
              <Text style={{ color: colors.muted, fontSize: 13 }}>
                Tap Done to confirm · Tap backdrop to cancel
              </Text>
            </View>
          ) : listData.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={{ color: colors.muted, fontSize: 14 }}>No results found</Text>
            </View>
          ) : (
            <FlatList
              ref={listRef}
              data={listData}
              keyExtractor={(item) => item.key}
              renderItem={renderItem}
              keyboardShouldPersistTaps="always"
              style={{ flex: 1 }}
              contentContainerStyle={{ paddingBottom: 16 }}
            />
          )}
      </Animated.View>
    </View>
  )
}

const styles = StyleSheet.create({
  overlay: {
    zIndex: 100
  },
  backdrop: {
    backgroundColor: '#000'
  },
  panel: {
    position: 'absolute',
    left: 0,
    right: 0,
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 20
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    paddingHorizontal: 16
  },
  promptLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginRight: 8,
    flexShrink: 0
  },
  input: {
    flex: 1,
    fontSize: 15,
    paddingVertical: 14
  },
  sectionHeader: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.8,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 13,
    minHeight: 44,
    gap: 12
  },
  rowLabel: {
    fontSize: 15
  },
  snippet: {
    fontSize: 12,
    marginTop: 2
  },
  badge: {
    fontSize: 13,
    fontWeight: '600'
  },
  closeButton: {
    padding: 6
  },
  promptHint: {
    paddingHorizontal: 16,
    paddingVertical: 14
  },
  emptyState: {
    paddingHorizontal: 16,
    paddingVertical: 14
  }
})
