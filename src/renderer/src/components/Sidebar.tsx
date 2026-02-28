import { useState } from 'react'
import { Plus, Settings, MessageSquare, Trash2, Pencil, Check, X } from 'lucide-react'
import { useConversationsStore } from '../stores/conversations'
import type { Conversation } from '../types'

interface SidebarProps {
  onOpenSettings: () => void
}

function ConversationItem({
  conv,
  isActive,
  onSelect,
  onDelete,
  onRename
}: {
  conv: Conversation
  isActive: boolean
  onSelect: () => void
  onDelete: () => void
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
                onDelete()
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

export function Sidebar({ onOpenSettings }: SidebarProps): JSX.Element {
  const { conversations, activeId, setActiveId, createNew, deleteConv, renameConv } =
    useConversationsStore()

  const isMac = navigator.platform.toLowerCase().includes('mac')

  return (
    <div
      className="flex flex-col h-full"
      style={{
        width: '240px',
        background: 'var(--surface)',
        borderRight: '1px solid var(--border)'
      }}
    >
      {/* macOS traffic light spacer */}
      {isMac && <div style={{ height: '38px' }} className="drag-region shrink-0" />}

      {/* New chat button */}
      <div className="px-2 py-2 shrink-0">
        <button
          onClick={() => createNew()}
          className="flex items-center gap-2 w-full px-3 py-2 rounded-md text-sm transition-colors hover:opacity-80"
          style={{ background: 'var(--accent)', color: 'white' }}
        >
          <Plus size={15} />
          New Chat
        </button>
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto py-1">
        {conversations.length === 0 ? (
          <div className="px-3 py-4 text-xs text-center" style={{ color: 'var(--muted)' }}>
            No conversations yet
          </div>
        ) : (
          conversations.map((conv) => (
            <ConversationItem
              key={conv.id}
              conv={conv}
              isActive={conv.id === activeId}
              onSelect={() => setActiveId(conv.id)}
              onDelete={() => {
                deleteConv(conv.id)
                if (activeId === conv.id) setActiveId(null)
              }}
              onRename={(title) => renameConv(conv.id, title)}
            />
          ))
        )}
      </div>

      {/* Settings button at bottom */}
      <div className="px-2 py-2 shrink-0" style={{ borderTop: '1px solid var(--border)' }}>
        <button
          onClick={onOpenSettings}
          className="flex items-center gap-2 w-full px-3 py-2 rounded-md text-xs transition-colors hover:opacity-80"
          style={{ color: 'var(--muted)' }}
        >
          <Settings size={14} />
          Settings
        </button>
      </div>
    </div>
  )
}
