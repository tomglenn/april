import { useState, useEffect } from 'react'
import { SquarePen, Settings, MessageSquare, Trash2, Pencil, Check, X, Search, Bell, PanelLeftClose } from 'lucide-react'
import { useConversationsStore } from '../stores/conversations'
import { RemindersPanel } from './RemindersPanel'
import type { Conversation, Reminder } from '../types'

interface SidebarProps {
  onOpenSettings: () => void
  width: number
  collapsed: boolean
  onCollapse: () => void
  onWidthChange: (w: number) => void
}

function DeleteModal({
  title,
  onConfirm,
  onCancel
}: {
  title: string
  onConfirm: () => void
  onCancel: () => void
}): JSX.Element {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.5)' }}
      onClick={onCancel}
    >
      <div
        className="rounded-lg p-5 flex flex-col gap-4 shadow-xl"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)', width: 320 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium" style={{ color: 'var(--text)' }}>Delete conversation?</span>
          <span className="text-xs" style={{ color: 'var(--muted)' }}>
            "{title}" will be permanently deleted.
          </span>
        </div>
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 rounded-md text-xs hover:opacity-80 transition-opacity"
            style={{ background: 'var(--surface-alt)', color: 'var(--text)', border: '1px solid var(--border)' }}
          >
            Cancel
          </button>
          <button
            autoFocus
            onClick={onConfirm}
            className="px-3 py-1.5 rounded-md text-xs hover:opacity-80 transition-opacity"
            style={{ background: '#ef4444', color: 'white', border: 'none' }}
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  )
}

function ConversationItem({
  conv,
  isActive,
  onSelect,
  onDeleteRequest,
  onRename
}: {
  conv: Conversation
  isActive: boolean
  onSelect: () => void
  onDeleteRequest: () => void
  onRename: (title: string) => void
}): JSX.Element {
  const [isEditing, setIsEditing] = useState(false)
  const [editTitle, setEditTitle] = useState(conv.title)

  const handleRename = (): void => {
    if (editTitle.trim()) {
      onRename(editTitle.trim())
    }
    setIsEditing(false)
  }

  const handleCancelEdit = (): void => {
    setEditTitle(conv.title)
    setIsEditing(false)
  }

  return (
    <div
      className="group relative flex items-center gap-2 px-3 py-2 rounded-md cursor-pointer transition-colors mx-1"
      style={{
        background: isActive ? 'var(--surface-alt)' : 'transparent',
        color: isActive ? 'var(--text)' : 'var(--muted)'
      }}
      onClick={!isEditing ? onSelect : undefined}
    >
      <MessageSquare size={13} className="shrink-0" />

      {isEditing ? (
        <div className="flex-1 flex items-center gap-1">
          <input
            autoFocus
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleRename()
              if (e.key === 'Escape') handleCancelEdit()
            }}
            className="flex-1 bg-transparent text-xs outline-none border-b"
            style={{ borderColor: 'var(--accent)', color: 'var(--text)' }}
            onClick={(e) => e.stopPropagation()}
          />
          <button
            onClick={(e) => { e.stopPropagation(); handleRename() }}
            className="text-green-400 hover:opacity-80"
          >
            <Check size={12} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); handleCancelEdit() }}
            className="text-red-400 hover:opacity-80"
          >
            <X size={12} />
          </button>
        </div>
      ) : (
        <>
          <span className="flex-1 text-xs truncate">{conv.title}</span>
          <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-opacity">
            <button
              onClick={(e) => {
                e.stopPropagation()
                setIsEditing(true)
              }}
              className="p-0.5 rounded hover:opacity-80"
              style={{ color: 'var(--muted)' }}
            >
              <Pencil size={11} />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation()
                onDeleteRequest()
              }}
              className="p-0.5 rounded hover:text-red-400 transition-colors"
              style={{ color: 'var(--muted)' }}
            >
              <Trash2 size={11} />
            </button>
          </div>
        </>
      )}
    </div>
  )
}

export function Sidebar({ onOpenSettings, width, collapsed, onCollapse, onWidthChange }: SidebarProps): JSX.Element {
  const { conversations, activeId, setActiveId, createNew, deleteConv, renameConv } =
    useConversationsStore()
  const [query, setQuery] = useState('')
  const [showReminders, setShowReminders] = useState(false)
  const [reminderCount, setReminderCount] = useState(0)
  const [pendingDelete, setPendingDelete] = useState<Conversation | null>(null)
  const [isResizing, setIsResizing] = useState(false)

  useEffect(() => {
    const fetch = (): void => {
      window.api.listReminders().then((r: Reminder[]) => setReminderCount(r.length)).catch(() => {})
    }
    fetch()
    window.api.onRemindersChanged(fetch)
    return () => window.api.offRemindersChanged(fetch)
  }, [])

  const filtered = query.trim()
    ? conversations.filter((c) => c.title.toLowerCase().includes(query.toLowerCase()))
    : conversations

  const handleConfirmDelete = (): void => {
    if (!pendingDelete) return
    deleteConv(pendingDelete.id)
    if (activeId === pendingDelete.id) setActiveId(null)
    setPendingDelete(null)
  }

  return (
    <div
      className="flex flex-col h-full relative"
      style={{
        width: collapsed ? 0 : width,
        overflow: 'hidden',
        transition: isResizing ? 'none' : 'width 200ms ease',
        background: 'var(--surface)',
        borderRight: '1px solid var(--border)',
        flexShrink: 0,
      }}
    >
      {/* Title bar drag region with collapse + new chat buttons */}
      <div
        className="drag-region shrink-0 flex items-center justify-end gap-0.5 px-2"
        style={{ height: 38 }}
      >
        <button
          onClick={onCollapse}
          className="no-drag p-1.5 rounded-md hover:opacity-80 transition-opacity"
          style={{ color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer' }}
          title="Hide Sidebar (⌘B)"
        >
          <PanelLeftClose size={15} />
        </button>
        <button
          onClick={() => createNew()}
          className="no-drag p-1.5 rounded-md hover:opacity-80 transition-opacity"
          style={{ color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer' }}
          title="New Chat"
        >
          <SquarePen size={15} />
        </button>
      </div>

      {/* Search */}
      <div className="px-2 pb-1 shrink-0">
        <div
          className="flex items-center gap-1.5 px-2 py-1.5 rounded-md"
          style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}
        >
          <Search size={11} style={{ color: 'var(--muted)', flexShrink: 0 }} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape') setQuery('') }}
            placeholder="Filter..."
            className="flex-1 bg-transparent text-xs outline-none"
            style={{ color: 'var(--text)' }}
          />
          {query && (
            <button onClick={() => setQuery('')} style={{ color: 'var(--muted)', flexShrink: 0 }}>
              <X size={10} />
            </button>
          )}
        </div>
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto py-1">
        {conversations.length === 0 ? (
          <div className="px-3 py-4 text-xs text-center" style={{ color: 'var(--muted)' }}>
            No conversations yet
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-3 py-4 text-xs text-center" style={{ color: 'var(--muted)' }}>
            No matches
          </div>
        ) : (
          filtered.map((conv) => (
            <ConversationItem
              key={conv.id}
              conv={conv}
              isActive={conv.id === activeId}
              onSelect={() => setActiveId(conv.id)}
              onDeleteRequest={() => setPendingDelete(conv)}
              onRename={(title) => renameConv(conv.id, title)}
            />
          ))
        )}
      </div>

      {/* Bottom bar */}
      <div className="relative px-2 py-2 shrink-0 flex items-center gap-1" style={{ borderTop: '1px solid var(--border)' }}>
        <button
          onClick={onOpenSettings}
          className="flex items-center gap-2 flex-1 px-3 py-2 rounded-md text-xs transition-colors hover:opacity-80"
          style={{ color: 'var(--muted)' }}
        >
          <Settings size={14} />
          Settings
        </button>
        <button
          onClick={() => setShowReminders((v) => !v)}
          className="relative p-2 rounded-md transition-colors hover:opacity-80"
          style={{ color: 'var(--muted)' }}
          title="Reminders"
        >
          <Bell size={14} />
          {reminderCount > 0 && (
            <span
              className="absolute -top-0.5 -right-0.5 flex items-center justify-center text-white text-[9px] font-bold rounded-full"
              style={{ background: 'var(--accent)', width: '15px', height: '15px' }}
            >
              {reminderCount}
            </span>
          )}
        </button>
        {showReminders && <RemindersPanel onClose={() => setShowReminders(false)} />}
      </div>

      {pendingDelete && (
        <DeleteModal
          title={pendingDelete.title}
          onConfirm={handleConfirmDelete}
          onCancel={() => setPendingDelete(null)}
        />
      )}

      {/* Resize handle */}
      <div
        className="absolute top-0 right-0 h-full"
        style={{ width: 4, cursor: 'col-resize', zIndex: 10 }}
        onMouseDown={(e) => {
          e.preventDefault()
          setIsResizing(true)
          const startX = e.clientX
          const startWidth = width
          const onMove = (e: MouseEvent): void => {
            const next = Math.min(480, Math.max(160, startWidth + e.clientX - startX))
            onWidthChange(next)
          }
          const onUp = (): void => {
            setIsResizing(false)
            document.removeEventListener('mousemove', onMove)
            document.removeEventListener('mouseup', onUp)
          }
          document.addEventListener('mousemove', onMove)
          document.addEventListener('mouseup', onUp)
        }}
      />
    </div>
  )
}
