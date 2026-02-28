import { useState, useEffect } from 'react'
import { X, Plus, Trash2, Eye, EyeOff } from 'lucide-react'
import { useSettingsStore } from '../stores/settings'
import type { MCPServerConfig, Settings } from '../types'

type Personality = 'professional' | 'friendly' | 'creative' | 'concise' | 'custom'
type Tab = 'general' | 'personalisation' | 'advanced'

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

const TABS: { id: Tab; label: string }[] = [
  { id: 'general', label: 'General' },
  { id: 'personalisation', label: 'Personalisation' },
  { id: 'advanced', label: 'Advanced' }
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

function Label({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <label className="block text-xs font-medium mb-1" style={{ color: 'var(--muted)' }}>
      {children}
    </label>
  )
}

function SensitiveInput({
  value,
  onChange,
  placeholder
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
}): JSX.Element {
  const [show, setShow] = useState(false)
  return (
    <div className="relative">
      <input
        type={show ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 rounded-md text-sm outline-none"
        style={{
          background: 'var(--bg)',
          border: '1px solid var(--border)',
          color: 'var(--text)',
          paddingRight: '2.5rem'
        }}
      />
      <button
        onClick={() => setShow((v) => !v)}
        className="absolute right-2 top-1/2 -translate-y-1/2"
        style={{ color: 'var(--muted)' }}
      >
        {show ? <EyeOff size={14} /> : <Eye size={14} />}
      </button>
    </div>
  )
}

const inputCls = 'w-full px-3 py-2 rounded-md text-sm outline-none'
const inputStyle = { background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }

export function SettingsModal({ onClose }: Props): JSX.Element {
  const { settings, update } = useSettingsStore()
  const [tab, setTab] = useState<Tab>('general')
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
        className="relative rounded-xl shadow-2xl w-full flex flex-col"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)', height: '580px', maxHeight: '85vh', maxWidth: '640px' }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4 shrink-0"
          style={{ borderBottom: '1px solid var(--border)' }}
        >
          <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Settings</h2>
          <button onClick={onClose} className="p-1 rounded hover:opacity-70" style={{ color: 'var(--muted)' }}>
            <X size={16} />
          </button>
        </div>

        {/* Body: sidebar + content */}
        <div className="flex flex-1 min-h-0">
          {/* Left nav */}
          <div className="flex flex-col py-2 shrink-0" style={{ width: '140px', borderRight: '1px solid var(--border)' }}>
            {TABS.map(({ id, label }) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className="text-left px-4 py-2 text-sm transition-colors"
                style={{
                  color: tab === id ? 'var(--text)' : 'var(--muted)',
                  background: tab === id ? 'var(--bg)' : 'none',
                  border: 'none',
                  cursor: 'pointer',
                  fontWeight: tab === id ? 500 : 400,
                  borderRight: tab === id ? '2px solid var(--accent)' : '2px solid transparent'
                }}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-5 py-4">

            {/* ── General ── */}
            {tab === 'general' && (
              <>
                {/* Provider cards */}
                <Label>Provider</Label>
                <div className="flex gap-2 mb-4">
                  {(['anthropic', 'openai', 'ollama'] as const).map((p) => (
                    <button
                      key={p}
                      onClick={() => {
                        set('defaultProvider', p)
                        set('defaultModel', '')
                      }}
                      className="flex-1 py-2 rounded-lg text-xs font-medium transition-colors"
                      style={{
                        background: 'var(--bg)',
                        border: form.defaultProvider === p ? '2px solid var(--accent)' : '1px solid var(--border)',
                        color: 'var(--text)',
                        cursor: 'pointer'
                      }}
                    >
                      {p === 'anthropic' ? 'Anthropic' : p === 'openai' ? 'OpenAI' : 'Ollama'}
                    </button>
                  ))}
                </div>

                {/* Contextual credential */}
                {form.defaultProvider === 'anthropic' && (
                  <div className="mb-4">
                    <Label>Anthropic API Key</Label>
                    <SensitiveInput
                      value={form.anthropicApiKey}
                      onChange={(v) => set('anthropicApiKey', v)}
                      placeholder="sk-ant-..."
                    />
                  </div>
                )}
                {form.defaultProvider === 'openai' && (
                  <div className="mb-4">
                    <Label>OpenAI API Key</Label>
                    <SensitiveInput
                      value={form.openaiApiKey}
                      onChange={(v) => set('openaiApiKey', v)}
                      placeholder="sk-..."
                    />
                  </div>
                )}
                {form.defaultProvider === 'ollama' && (
                  <div className="mb-4">
                    <Label>Ollama Base URL</Label>
                    <input
                      type="text"
                      value={form.ollamaBaseUrl}
                      onChange={(e) => set('ollamaBaseUrl', e.target.value)}
                      placeholder="http://localhost:11434"
                      className={inputCls}
                      style={inputStyle}
                    />
                  </div>
                )}

                {/* Model */}
                <div className="mb-4">
                  <Label>Model</Label>
                  {form.defaultProvider === 'ollama' || modelInputFailed ? (
                    <input
                      type="text"
                      value={form.defaultModel}
                      onChange={(e) => set('defaultModel', e.target.value)}
                      placeholder={form.defaultProvider === 'ollama' ? 'e.g. llama3.2, mistral, phi3' : 'Enter model name'}
                      className={`${inputCls} font-mono`}
                      style={inputStyle}
                    />
                  ) : models.length > 0 ? (
                    <div className="relative">
                      <select
                        value={form.defaultModel}
                        onChange={(e) => set('defaultModel', e.target.value)}
                        className={`${inputCls} font-mono appearance-none pr-8`}
                        style={inputStyle}
                      >
                        {models.map((m) => (
                          <option key={m} value={m}>{m}</option>
                        ))}
                      </select>
                      <span className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-base" style={{ color: 'var(--muted)' }}>▾</span>
                    </div>
                  ) : (
                    <div className={`${inputCls} font-mono`} style={{ ...inputStyle, color: 'var(--muted)' }}>
                      {form.defaultModel || 'Loading models…'}
                    </div>
                  )}
                </div>

                {/* Image generation — shown for non-OpenAI providers */}
                {form.defaultProvider !== 'openai' && (
                  <div
                    className="rounded-lg p-3"
                    style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}
                  >
                    <p className="text-xs font-medium mb-1" style={{ color: 'var(--text)' }}>Image Generation</p>
                    <p className="text-xs mb-3" style={{ color: 'var(--muted)' }}>
                      April uses OpenAI to generate images regardless of your active provider. Add an OpenAI key to enable this.
                    </p>
                    <Label>OpenAI API Key (optional)</Label>
                    <SensitiveInput
                      value={form.openaiApiKey}
                      onChange={(v) => set('openaiApiKey', v)}
                      placeholder="sk-..."
                    />
                  </div>
                )}
              </>
            )}

            {/* ── Personalisation ── */}
            {tab === 'personalisation' && (
              <>
                <div className="mb-4">
                  <Label>Your name (optional)</Label>
                  <input
                    type="text"
                    value={form.userName}
                    onChange={(e) => set('userName', e.target.value)}
                    placeholder="What should April call you?"
                    className={inputCls}
                    style={inputStyle}
                  />
                </div>
                <div className="mb-4">
                  <Label>Location (optional)</Label>
                  <input
                    type="text"
                    value={form.userLocation}
                    onChange={(e) => set('userLocation', e.target.value)}
                    placeholder="e.g. London, UK"
                    className={inputCls}
                    style={inputStyle}
                  />
                </div>
                <div className="mb-5">
                  <Label>About you (optional)</Label>
                  <textarea
                    value={form.userBio}
                    onChange={(e) => set('userBio', e.target.value)}
                    rows={3}
                    placeholder="e.g. I'm a software engineer who works mostly in TypeScript…"
                    className={`${inputCls} resize-y`}
                    style={{ ...inputStyle, fontFamily: 'inherit' }}
                  />
                </div>

                <Label>Personality</Label>
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
                    className={`${inputCls} resize-y mt-2`}
                    style={{ ...inputStyle, fontFamily: 'inherit' }}
                  />
                )}

                <div className="mt-5">
                  <Label>Theme</Label>
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
              </>
            )}

            {/* ── Advanced ── */}
            {tab === 'advanced' && (
              <>
                <div className="flex items-center justify-between mb-3">
                  <Label>MCP Servers</Label>
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
              </>
            )}
          </div>
        </div>

        {/* Footer */}
        <div
          className="flex justify-end gap-2 px-5 py-4 shrink-0"
          style={{ borderTop: '1px solid var(--border)' }}
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
