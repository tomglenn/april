import { useState, useEffect } from 'react'
import { X, Plus, Trash2, Eye, EyeOff } from 'lucide-react'
import { useSettingsStore } from '../stores/settings'
import type { MCPServerConfig, Settings } from '../types'

type Personality = 'professional' | 'friendly' | 'creative' | 'concise' | 'custom'

const PERSONALITY_PROMPTS: Record<Exclude<Personality, 'custom'>, string> = {
  professional: 'Communicate formally and precisely. Keep responses well-structured and focused on the task. Avoid small talk.',
  friendly: 'Communicate warmly and conversationally. Be encouraging and personable.',
  creative: 'Bring imagination and enthusiasm to everything. Think expansively and embrace creative exploration.',
  concise: 'Always be brief. Get to the point immediately. Use as few words as possible while remaining accurate.'
}

const PERSONALITIES: { id: Personality; label: string; description: string }[] = [
  { id: 'professional', label: 'Professional', description: 'Formal and structured' },
  { id: 'friendly', label: 'Friendly', description: 'Warm and conversational' },
  { id: 'creative', label: 'Creative', description: 'Imaginative and expansive' },
  { id: 'concise', label: 'Concise', description: 'Brief and to the point' },
  { id: 'custom', label: 'Custom', description: 'Write your own' }
]

function detectPersonality(prompt: string): Personality | null {
  for (const [id, text] of Object.entries(PERSONALITY_PROMPTS)) {
    if (prompt.includes(text)) return id as Personality
  }
  return null
}

function applyPersonality(prompt: string, personality: Personality, customText: string): string {
  let base = prompt
  for (const text of Object.values(PERSONALITY_PROMPTS)) {
    base = base.replace('\n\n' + text, '').replace(text, '')
  }
  const addition = personality === 'custom' ? customText : PERSONALITY_PROMPTS[personality as Exclude<Personality, 'custom'>]
  return base.trimEnd() + '\n\n' + addition
}

interface Props {
  onClose: () => void
}

function Field({
  label,
  type = 'text',
  value,
  onChange,
  placeholder,
  sensitive
}: {
  label: string
  type?: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  sensitive?: boolean
}): JSX.Element {
  const [show, setShow] = useState(false)

  return (
    <div className="mb-4">
      <label className="block text-xs font-medium mb-1" style={{ color: 'var(--muted)' }}>
        {label}
      </label>
      <div className="relative">
        <input
          type={sensitive && !show ? 'password' : type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full px-3 py-2 rounded-md text-sm outline-none"
          style={{
            background: 'var(--bg)',
            border: '1px solid var(--border)',
            color: 'var(--text)',
            paddingRight: sensitive ? '2.5rem' : undefined
          }}
        />
        {sensitive && (
          <button
            onClick={() => setShow((v) => !v)}
            className="absolute right-2 top-1/2 -translate-y-1/2"
            style={{ color: 'var(--muted)' }}
          >
            {show ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        )}
      </div>
    </div>
  )
}

const SECTION_TITLE = 'text-xs font-semibold uppercase tracking-wider mb-3 mt-5'

export function SettingsModal({ onClose }: Props): JSX.Element {
  const { settings, update } = useSettingsStore()
  const [form, setForm] = useState<Settings>(
    settings ?? {
      anthropicApiKey: '',
      openaiApiKey: '',
      ollamaBaseUrl: 'http://localhost:11434',
      defaultProvider: 'anthropic',
      defaultModel: 'claude-sonnet-4-6',
      theme: 'dark',
      systemPrompt: '',
      setupCompleted: true,
      userName: '',
      userLocation: '',
      userBio: ''
    }
  )
  const [models, setModels] = useState<string[]>([])
  const [modelInputFailed, setModelInputFailed] = useState(false)
  const [mcpServers, setMcpServers] = useState<MCPServerConfig[]>([])
  const [saving, setSaving] = useState(false)
  const [personality, setPersonality] = useState<Personality | null>(() =>
    detectPersonality(settings?.systemPrompt ?? '')
  )
  const [customPrompt, setCustomPrompt] = useState(PERSONALITY_PROMPTS.friendly)

  useEffect(() => {
    if (settings) setForm(settings)
  }, [settings])

  // Reload model list whenever the provider changes
  useEffect(() => {
    setModels([])
    setModelInputFailed(false)
    if (form.defaultProvider === 'ollama') return
    window.api
      .listModels(form.defaultProvider)
      .then((list) => {
        if (list.length > 0) {
          setModels(list)
        } else {
          setModelInputFailed(true)
        }
      })
      .catch(() => setModelInputFailed(true))
  }, [form.defaultProvider])

  const set = (key: keyof Settings, value: string): void => {
    setForm((f) => ({ ...f, [key]: value }))
  }

  const handleSave = async (): Promise<void> => {
    setSaving(true)
    const toSave = personality
      ? { ...form, systemPrompt: applyPersonality(form.systemPrompt, personality, customPrompt) }
      : form
    await update(toSave)
    setSaving(false)
    onClose()
  }

  const addMcp = (): void => {
    setMcpServers((prev) => [...prev, { name: '', command: '', args: [], enabled: true }])
  }

  const removeMcp = (i: number): void => {
    setMcpServers((prev) => prev.filter((_, idx) => idx !== i))
  }

  const updateMcp = (i: number, key: keyof MCPServerConfig, val: string | boolean): void => {
    setMcpServers((prev) => prev.map((s, idx) => (idx === i ? { ...s, [key]: val } : s)))
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.6)' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="relative rounded-xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4 sticky top-0"
          style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}
        >
          <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Settings</h2>
          <button onClick={onClose} className="p-1 rounded hover:opacity-70" style={{ color: 'var(--muted)' }}>
            <X size={16} />
          </button>
        </div>

        <div className="px-5 py-4">
          {/* API Keys */}
          <p className={SECTION_TITLE} style={{ color: 'var(--muted)', marginTop: 0 }}>API Keys</p>

          <Field
            label="Anthropic API Key"
            value={form.anthropicApiKey}
            onChange={(v) => set('anthropicApiKey', v)}
            placeholder="sk-ant-..."
            sensitive
          />
          <Field
            label="OpenAI API Key"
            value={form.openaiApiKey}
            onChange={(v) => set('openaiApiKey', v)}
            placeholder="sk-..."
            sensitive
          />
          <Field
            label="Ollama Base URL"
            value={form.ollamaBaseUrl}
            onChange={(v) => set('ollamaBaseUrl', v)}
            placeholder="http://localhost:11434"
          />

          {/* Model */}
          <p className={SECTION_TITLE} style={{ color: 'var(--muted)' }}>Model</p>

          <div className="mb-4">
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--muted)' }}>
              Provider
            </label>
            <div className="relative">
              <select
                value={form.defaultProvider}
                onChange={(e) => {
                  set('defaultProvider', e.target.value)
                  // Reset model when provider changes so we don't carry over a model from another provider
                  set('defaultModel', '')
                }}
                className="w-full px-3 py-2 rounded-md text-sm outline-none appearance-none pr-8"
                style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }}
              >
                <option value="anthropic">Anthropic</option>
                <option value="openai">OpenAI</option>
                <option value="ollama">Ollama</option>
              </select>
              <span className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-base" style={{ color: 'var(--muted)' }}>▾</span>
            </div>
          </div>

          <div className="mb-4">
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--muted)' }}>
              Model
            </label>
            {form.defaultProvider === 'ollama' || modelInputFailed ? (
              <input
                type="text"
                value={form.defaultModel}
                onChange={(e) => set('defaultModel', e.target.value)}
                placeholder={form.defaultProvider === 'ollama' ? 'e.g. llama3.2, mistral, phi3' : 'Enter model name'}
                className="w-full px-3 py-2 rounded-md text-sm outline-none font-mono"
                style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }}
              />
            ) : models.length > 0 ? (
              <div className="relative">
                <select
                  value={form.defaultModel}
                  onChange={(e) => set('defaultModel', e.target.value)}
                  className="w-full px-3 py-2 rounded-md text-sm outline-none font-mono appearance-none pr-8"
                  style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }}
                >
                  {models.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-base" style={{ color: 'var(--muted)' }}>▾</span>
              </div>
            ) : (
              <div
                className="w-full px-3 py-2 rounded-md text-sm font-mono"
                style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--muted)' }}
              >
                {form.defaultModel || 'Loading models…'}
              </div>
            )}
          </div>

          {/* Appearance */}
          <p className={SECTION_TITLE} style={{ color: 'var(--muted)' }}>Appearance</p>

          <div className="mb-4">
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--muted)' }}>
              Theme
            </label>
            <div className="flex gap-2">
              {(['dark', 'light', 'system'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => set('theme', t)}
                  className="flex-1 py-1.5 rounded-md text-xs capitalize transition-colors"
                  style={{
                    background: form.theme === t ? 'var(--accent)' : 'var(--bg)',
                    color: form.theme === t ? 'white' : 'var(--muted)',
                    border: '1px solid var(--border)'
                  }}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Personalisation */}
          <p className={SECTION_TITLE} style={{ color: 'var(--muted)' }}>Personalisation</p>

          <Field
            label="Your name"
            value={form.userName}
            onChange={(v) => set('userName', v)}
            placeholder="What should April call you?"
          />
          <Field
            label="Location (optional)"
            value={form.userLocation}
            onChange={(v) => set('userLocation', v)}
            placeholder="e.g. London, UK"
          />
          <div className="mb-4">
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--muted)' }}>
              About you (optional)
            </label>
            <textarea
              value={form.userBio}
              onChange={(e) => set('userBio', e.target.value)}
              rows={3}
              placeholder="e.g. I'm a software engineer who works mostly in TypeScript…"
              className="w-full px-3 py-2 rounded-md text-sm outline-none resize-y"
              style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', fontFamily: 'inherit' }}
            />
          </div>

          {/* Personality */}
          <p className={SECTION_TITLE} style={{ color: 'var(--muted)' }}>Personality</p>
          <div className="grid grid-cols-3 gap-2 mb-2">
            {PERSONALITIES.map(({ id, label, description }) => (
              <button
                key={id}
                onClick={() => setPersonality(id)}
                className="p-3 rounded-lg text-left transition-colors"
                style={{
                  background: 'var(--bg)',
                  border: personality === id ? '2px solid var(--accent)' : '1px solid var(--border)',
                  color: 'var(--text)'
                }}
              >
                <div className="text-xs font-semibold mb-0.5">{label}</div>
                <div className="text-xs" style={{ color: 'var(--muted)' }}>{description}</div>
              </button>
            ))}
          </div>
          {personality === 'custom' && (
            <textarea
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              rows={3}
              placeholder="Describe how April should communicate…"
              className="w-full px-3 py-2 rounded-md text-sm outline-none mb-4 resize-y"
              style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', fontFamily: 'inherit' }}
            />
          )}

          {/* MCP Servers */}
          <div className="flex items-center justify-between mt-5 mb-3">
            <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--muted)' }}>
              MCP Servers
            </p>
            <button
              onClick={addMcp}
              className="flex items-center gap-1 text-xs px-2 py-1 rounded-md transition-colors hover:opacity-80"
              style={{ color: 'var(--accent)', background: 'rgba(59,130,246,0.08)' }}
            >
              <Plus size={12} /> Add Server
            </button>
          </div>

          {mcpServers.length === 0 ? (
            <p className="text-xs" style={{ color: 'var(--muted)' }}>No MCP servers configured.</p>
          ) : (
            mcpServers.map((srv, i) => (
              <div
                key={i}
                className="mb-3 p-3 rounded-md"
                style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium" style={{ color: 'var(--text)' }}>
                    Server {i + 1}
                  </span>
                  <button onClick={() => removeMcp(i)} style={{ color: 'var(--muted)' }}>
                    <Trash2 size={12} />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    placeholder="Name"
                    value={srv.name}
                    onChange={(e) => updateMcp(i, 'name', e.target.value)}
                    className="px-2 py-1 rounded text-xs outline-none"
                    style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}
                  />
                  <input
                    placeholder="Command (e.g. npx)"
                    value={srv.command}
                    onChange={(e) => updateMcp(i, 'command', e.target.value)}
                    className="px-2 py-1 rounded text-xs outline-none"
                    style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}
                  />
                </div>
                <input
                  placeholder="Args (space-separated)"
                  value={srv.args.join(' ')}
                  onChange={(e) =>
                    setMcpServers((prev) =>
                      prev.map((s, idx) =>
                        idx === i ? { ...s, args: e.target.value.split(' ').filter(Boolean) } : s
                      )
                    )
                  }
                  className="mt-2 w-full px-2 py-1 rounded text-xs outline-none font-mono"
                  style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}
                />
                <label className="flex items-center gap-2 mt-2 text-xs" style={{ color: 'var(--muted)' }}>
                  <input
                    type="checkbox"
                    checked={srv.enabled}
                    onChange={(e) => updateMcp(i, 'enabled', e.target.checked)}
                  />
                  Enabled
                </label>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div
          className="flex justify-end gap-2 px-5 py-4 sticky bottom-0"
          style={{ background: 'var(--surface)', borderTop: '1px solid var(--border)' }}
        >
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-md text-xs transition-colors hover:opacity-80"
            style={{ color: 'var(--muted)', background: 'var(--bg)', border: '1px solid var(--border)' }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-1.5 rounded-md text-xs transition-colors hover:opacity-80 disabled:opacity-50"
            style={{ background: 'var(--accent)', color: 'white' }}
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
