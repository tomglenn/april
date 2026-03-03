import { useState } from 'react'
import { X } from 'lucide-react'
import { MCP_CATALOG, buildServerConfig } from '@april/core'
import type { MCPServerConfig } from '../types'

const CATEGORY_EMOJI: Record<string, string> = {
  files: '📁',
  web: '🌐',
  data: '🗄️',
  dev: '🛠️',
  productivity: '🧠'
}

interface Props {
  onAdd: (server: MCPServerConfig) => void
  onClose: () => void
}

export function MCPCatalog({ onAdd, onClose }: Props): JSX.Element {
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const [paramValues, setParamValues] = useState<Record<string, string>>({})

  const filtered = MCP_CATALOG.filter((e) => {
    const q = search.toLowerCase()
    return e.name.toLowerCase().includes(q) || e.description.toLowerCase().includes(q)
  })

  const handleAdd = (entryId: string): void => {
    const entry = MCP_CATALOG.find((e) => e.id === entryId)
    if (!entry) return
    const config = buildServerConfig(entry, paramValues)
    onAdd(config)
    onClose()
  }

  const handleRowClick = (entryId: string): void => {
    const entry = MCP_CATALOG.find((e) => e.id === entryId)
    if (!entry) return
    if (!entry.params || entry.params.length === 0) {
      handleAdd(entryId)
      return
    }
    setSelected(selected === entryId ? null : entryId)
    setParamValues({})
  }

  return (
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{ zIndex: 60, background: 'rgba(0,0,0,0.5)' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="w-full rounded-xl shadow-2xl flex flex-col"
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          maxWidth: '560px',
          maxHeight: '80vh'
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4 shrink-0"
          style={{ borderBottom: '1px solid var(--border)' }}
        >
          <h3 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
            Add from catalog
          </h3>
          <button onClick={onClose} className="p-1 rounded hover:opacity-70" style={{ color: 'var(--muted)' }}>
            <X size={16} />
          </button>
        </div>

        {/* Search */}
        <div className="px-4 pt-3 pb-2 shrink-0">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search servers..."
            autoFocus
            className="w-full px-3 py-2 rounded-md text-sm outline-none"
            style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }}
          />
        </div>

        {/* Server list */}
        <div className="flex-1 overflow-y-auto px-4 pb-4">
          {filtered.map((entry) => (
            <div key={entry.id}>
              <div
                className="flex items-start gap-3 py-3 px-2 rounded-lg cursor-pointer hover:opacity-80 transition-opacity"
                style={{ borderBottom: '1px solid var(--border)' }}
              >
                <span className="text-xl shrink-0 mt-0.5">{CATEGORY_EMOJI[entry.category]}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-sm font-medium" style={{ color: 'var(--text)' }}>
                      {entry.name}
                    </span>
                    <span
                      className="text-xs px-1.5 py-0.5 rounded"
                      style={{ background: 'var(--bg)', color: 'var(--muted)' }}
                    >
                      {entry.category}
                    </span>
                  </div>
                  <p className="text-xs" style={{ color: 'var(--muted)' }}>
                    {entry.description}
                  </p>
                </div>
                <button
                  onClick={() => handleRowClick(entry.id)}
                  className="shrink-0 text-xs px-3 py-1 rounded-md transition-colors hover:opacity-80"
                  style={{ background: 'rgba(59,130,246,0.1)', color: 'var(--accent)' }}
                >
                  Add →
                </button>
              </div>

              {/* Inline param form */}
              {selected === entry.id && entry.params && (
                <div
                  className="mx-2 mb-2 p-3 rounded-lg"
                  style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}
                >
                  {entry.params.map((param) => (
                    <div key={param.id} className="mb-3">
                      <label className="block text-xs font-medium mb-1" style={{ color: 'var(--muted)' }}>
                        {param.label}
                      </label>
                      <input
                        type={param.type === 'secret' ? 'password' : 'text'}
                        value={paramValues[param.id] ?? ''}
                        onChange={(e) =>
                          setParamValues((v) => ({ ...v, [param.id]: e.target.value }))
                        }
                        placeholder={param.placeholder}
                        className="w-full px-3 py-2 rounded-md text-sm outline-none font-mono"
                        style={{
                          background: 'var(--surface)',
                          border: '1px solid var(--border)',
                          color: 'var(--text)'
                        }}
                      />
                    </div>
                  ))}
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleAdd(entry.id)}
                      className="px-3 py-1.5 rounded-md text-xs font-medium transition-colors hover:opacity-80"
                      style={{ background: 'var(--accent)', color: 'white' }}
                    >
                      Add to April
                    </button>
                    <button
                      onClick={() => setSelected(null)}
                      className="px-3 py-1.5 rounded-md text-xs transition-colors hover:opacity-80"
                      style={{ color: 'var(--muted)', background: 'var(--surface)', border: '1px solid var(--border)' }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}

          {filtered.length === 0 && (
            <p className="text-xs text-center py-8" style={{ color: 'var(--muted)' }}>
              No servers match "{search}"
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
