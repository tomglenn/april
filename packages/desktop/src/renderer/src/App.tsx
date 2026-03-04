import { useEffect, useRef, useState } from 'react'
import { Sidebar } from './components/Sidebar'
import { ConversationView } from './components/ConversationView'
import { ErrorBoundary } from './components/ErrorBoundary'
import { SettingsModal } from './components/SettingsModal'
import { SetupWizard } from './components/SetupWizard'
import { QuickSwitcher } from './components/QuickSwitcher'
import { useConversationsStore } from './stores/conversations'
import { useSettingsStore } from './stores/settings'
import type { ChunkData } from './types'

function matchesAccelerator(e: KeyboardEvent, accelerator: string): boolean {
  const parts = accelerator.split('+')
  const key = parts[parts.length - 1]
  const hasCmdOrCtrl = parts.includes('CmdOrCtrl')
  const hasShift = parts.includes('Shift')
  const hasAlt = parts.includes('Alt')
  const modMatches =
    (hasCmdOrCtrl ? e.metaKey || e.ctrlKey : !(e.metaKey || e.ctrlKey)) &&
    (hasShift ? e.shiftKey : !e.shiftKey) &&
    (hasAlt ? e.altKey : !e.altKey)
  if (!modMatches) return false
  const keyMap: Record<string, string> = {
    Space: ' ', Up: 'ArrowUp', Down: 'ArrowDown', Left: 'ArrowLeft', Right: 'ArrowRight',
    Return: 'Enter', Backspace: 'Backspace', Delete: 'Delete', Tab: 'Tab'
  }
  const expected = keyMap[key] ?? key
  return e.key.toUpperCase() === expected.toUpperCase()
}

export default function App(): JSX.Element {
  const { load: loadConversations, createNew, setActiveId } = useConversationsStore()
  const { load: loadSettings, settings } = useSettingsStore()
  const [showSettings, setShowSettings] = useState(false)
  const [showQuickSwitcher, setShowQuickSwitcher] = useState(false)

  useEffect(() => {
    loadSettings()
    loadConversations()
  }, [])

  // Listen for overlay "Open in April" requests + forwarded stream chunks
  const forwardedChunkRef = useRef<((data: ChunkData) => void) | null>(null)

  useEffect(() => {
    const handler = (id: string): void => {
      loadConversations().then(() => setActiveId(id))

      // Clean up any previous forwarded stream listener
      if (forwardedChunkRef.current) {
        window.api.offChunk(forwardedChunkRef.current)
        forwardedChunkRef.current = null
      }

      // Listen for forwarded chunks from the overlay's ongoing stream.
      // Use an accumulator + replace (not append) to be robust against
      // store resets from loadConversations or sync watcher.
      let accumulated = ''
      let baseText: string | null = null

      const chunkHandler = (data: ChunkData): void => {
        if (data.conversationId !== id) return

        if (data.type === 'text_delta' && data.text) {
          accumulated += data.text

          const state = useConversationsStore.getState()
          const conv = state.conversations.find((c) => c.id === id)
          if (!conv) return
          const lastMsg = conv.messages[conv.messages.length - 1]
          if (lastMsg?.role !== 'assistant') return

          // Capture base text once from the saved partial message
          if (baseText === null) {
            const tb = lastMsg.blocks.find((b) => b.type === 'text')
            baseText = tb ? (tb as { type: 'text'; text: string }).text : ''
          }

          state.updateMessageById(id, lastMsg.id, (msg) => {
            const blocks = [...msg.blocks]
            const lastTextIdx = blocks.reduce(
              (acc, b, i) => (b.type === 'text' ? i : acc), -1
            )
            if (lastTextIdx >= 0) {
              blocks[lastTextIdx] = { type: 'text', text: baseText + accumulated }
            }
            return { ...msg, blocks }
          })
        } else if (data.type === 'done' || data.type === 'aborted' || data.type === 'error') {
          // Persist final state and clean up
          const state = useConversationsStore.getState()
          const conv = state.conversations.find((c) => c.id === id)
          if (conv) window.api.updateConversation(conv).catch(() => {})
          window.api.offChunk(chunkHandler)
          if (forwardedChunkRef.current === chunkHandler) {
            forwardedChunkRef.current = null
          }
        }
      }
      forwardedChunkRef.current = chunkHandler
      window.api.onChunk(chunkHandler)
    }
    window.api.onOpenConversation(handler)
    return () => {
      window.api.offOpenConversation(handler)
      if (forwardedChunkRef.current) {
        window.api.offChunk(forwardedChunkRef.current)
        forwardedChunkRef.current = null
      }
    }
  }, [loadConversations, setActiveId])

  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      const mod = e.metaKey || e.ctrlKey
      if (!mod) return
      if (e.key === 'n') { e.preventDefault(); createNew() }
      if (e.key === ',') { e.preventDefault(); setShowSettings(true) }
      if (settings && matchesAccelerator(e, settings.quickSwitcherHotkey)) {
        e.preventDefault()
        setShowQuickSwitcher(true)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [createNew, settings])

  const showWizard = settings !== null && !settings.setupCompleted

  return (
    <div className="flex h-full overflow-hidden" style={{ background: 'var(--bg)' }}>
      <Sidebar onOpenSettings={() => setShowSettings(true)} />
      <ErrorBoundary>
        <ConversationView onOpenSettings={() => setShowSettings(true)} />
      </ErrorBoundary>
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
      {showQuickSwitcher && settings && <QuickSwitcher onClose={() => setShowQuickSwitcher(false)} />}
      {showWizard && <SetupWizard />}
    </div>
  )
}
