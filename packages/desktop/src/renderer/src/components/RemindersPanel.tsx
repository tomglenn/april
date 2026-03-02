import { useState, useEffect, useRef } from 'react'
import { X, Trash2 } from 'lucide-react'
import type { Reminder } from '../types'

function relativeTime(fireAt: number): string {
  const diff = fireAt - Date.now()
  if (diff <= 0) return 'now'
  const mins = Math.ceil(diff / 60000)
  if (mins < 60) return `in ${mins} min`
  const hours = Math.floor(mins / 60)
  const remaining = mins % 60
  if (remaining === 0) return `in ${hours}h`
  return `in ${hours}h ${remaining}m`
}

interface Props {
  onClose: () => void
}

export function RemindersPanel({ onClose }: Props): JSX.Element {
  const [reminders, setReminders] = useState<Reminder[]>([])
  const panelRef = useRef<HTMLDivElement>(null)

  const fetchReminders = (): void => {
    window.api.listReminders().then(setReminders).catch(() => {})
  }

  useEffect(() => {
    fetchReminders()
    const cb = (): void => fetchReminders()
    window.api.onRemindersChanged(cb)
    // Update relative times every 30s
    const timer = setInterval(fetchReminders, 30000)
    return () => {
      window.api.offRemindersChanged(cb)
      clearInterval(timer)
    }
  }, [])

  // Close on click outside
  useEffect(() => {
    const handler = (e: MouseEvent): void => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    // Delay to avoid immediate close from the click that opened us
    const id = setTimeout(() => document.addEventListener('mousedown', handler), 50)
    return () => {
      clearTimeout(id)
      document.removeEventListener('mousedown', handler)
    }
  }, [onClose])

  return (
    <div
      ref={panelRef}
      className="absolute bottom-12 left-2 z-50 rounded-lg shadow-xl overflow-hidden"
      style={{
        width: '260px',
        background: 'var(--surface)',
        border: '1px solid var(--border)'
      }}
    >
      <div
        className="flex items-center justify-between px-3 py-2"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        <span className="text-xs font-medium" style={{ color: 'var(--text)' }}>
          Reminders
        </span>
        <button onClick={onClose} className="p-0.5 rounded hover:opacity-70" style={{ color: 'var(--muted)' }}>
          <X size={12} />
        </button>
      </div>

      <div className="max-h-64 overflow-y-auto">
        {reminders.length === 0 ? (
          <div className="px-3 py-4 text-xs text-center" style={{ color: 'var(--muted)' }}>
            Ask April to remind you about something
          </div>
        ) : (
          reminders.map((r) => (
            <div
              key={r.id}
              className="flex items-start gap-2 px-3 py-2 transition-colors"
              style={{ borderBottom: '1px solid var(--border)' }}
            >
              <div className="flex-1 min-w-0">
                <div className="text-xs truncate" style={{ color: 'var(--text)' }}>
                  {r.message}
                </div>
                <div className="text-xs mt-0.5" style={{ color: 'var(--muted)', opacity: 0.7 }}>
                  {relativeTime(r.fireAt)}
                </div>
              </div>
              <button
                onClick={() => window.api.cancelReminder(r.id)}
                className="p-0.5 rounded hover:text-red-400 transition-colors shrink-0 mt-0.5"
                style={{ color: 'var(--muted)' }}
                title="Cancel reminder"
              >
                <Trash2 size={11} />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
