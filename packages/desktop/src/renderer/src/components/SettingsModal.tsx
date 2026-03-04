import { useState, useEffect, useRef, useCallback } from 'react'
import { X, Plus, Trash2, Loader, CheckCircle, AlertCircle } from 'lucide-react'
import { useSettingsStore } from '../stores/settings'
import type { MCPServerConfig, Settings } from '../types'
import type { MCPServerStatus } from '../types'
import { MCPCatalog } from './MCPCatalog'
import { SensitiveInput } from './SensitiveInput'
import { MODEL_CATALOG } from '../models'
import type { Provider } from '../types'
import { LOCAL_DEFAULTS, SYNCED_DEFAULTS } from '@april/core'

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

function detectPersonality(personalityPrompt: string): { personality: Personality | null; customText: string } {
  if (!personalityPrompt) return { personality: null, customText: '' }
  for (const [id, text] of Object.entries(PERSONALITY_PROMPTS)) {
    if (personalityPrompt === text) return { personality: id as Personality, customText: '' }
  }
  return { personality: 'custom', customText: personalityPrompt }
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

const inputCls = 'w-full px-3 py-2 rounded-md text-sm outline-none'
const inputStyle = { background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }

function formatAccelerator(e: KeyboardEvent): string | null {
  // Ignore bare modifier presses
  if (['Meta', 'Control', 'Alt', 'Shift'].includes(e.key)) return null

  const parts: string[] = []
  if (e.metaKey || e.ctrlKey) parts.push('CmdOrCtrl')
  if (e.altKey) parts.push('Alt')
  if (e.shiftKey) parts.push('Shift')

  // Need at least one modifier
  if (parts.length === 0) return null

  // Map special keys
  const keyMap: Record<string, string> = {
    ' ': 'Space', ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right',
    Backspace: 'Backspace', Delete: 'Delete', Tab: 'Tab', Enter: 'Return'
  }
  const key = keyMap[e.key] || (e.key.length === 1 ? e.key.toUpperCase() : e.key)
  parts.push(key)
  return parts.join('+')
}

function displayAccelerator(accel: string): string {
  const isMac = navigator.platform.includes('Mac')
  return accel
    .replace(/CmdOrCtrl/g, isMac ? '\u2318' : 'Ctrl')
    .replace(/Shift/g, isMac ? '\u21E7' : 'Shift')
    .replace(/Alt/g, isMac ? '\u2325' : 'Alt')
    .replace(/\+/g, isMac ? '' : '+')
}

function HotkeyRecorder({ value, onChange }: { value: string; onChange: (v: string) => void }): JSX.Element {
  const [recording, setRecording] = useState(false)

  useEffect(() => {
    if (!recording) return
    const handler = (e: KeyboardEvent): void => {
      e.preventDefault()
      e.stopPropagation()
      if (e.key === 'Escape') { setRecording(false); return }
      const accel = formatAccelerator(e)
      if (accel) {
        onChange(accel)
        setRecording(false)
      }
    }
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [recording, onChange])

  return (
    <button
      onClick={() => setRecording(true)}
      className="px-3 py-2 rounded-md text-sm font-mono transition-all"
      style={{
        background: 'var(--bg)',
        border: recording ? '2px solid var(--accent)' : '1px solid var(--border)',
        color: recording ? 'var(--accent)' : 'var(--text)',
        animation: recording ? 'pulse 1.5s infinite' : 'none',
        minWidth: '160px',
        textAlign: 'center'
      }}
    >
      {recording ? 'Press a shortcut...' : displayAccelerator(value)}
    </button>
  )
}

export function SettingsModal({ onClose }: Props): JSX.Element {
  const { settings, update } = useSettingsStore()
  const [tab, setTab] = useState<Tab>('general')
  const [form, setForm] = useState<Settings>(
    settings ?? { ...LOCAL_DEFAULTS, ...SYNCED_DEFAULTS, dataFolder: '', setupCompleted: true }
  )
  const [dataFolder, setDataFolder] = useState('')
  const [mcpStatus, setMcpStatus] = useState<MCPServerStatus[]>([])
  const [argsText, setArgsText] = useState<Record<number, string>>({})
  const [showCatalog, setShowCatalog] = useState(false)
  const [useCustomModel, setUseCustomModel] = useState(false)
  const [modelProviderTab, setModelProviderTab] = useState<Provider>(
    settings?.defaultProvider ?? 'anthropic'
  )
  const [providerModels, setProviderModels] = useState<Record<Provider, string>>(() => {
    const defaults: Record<Provider, string> = {
      anthropic: MODEL_CATALOG.find((m) => m.provider === 'anthropic')?.model ?? '',
      openai:    MODEL_CATALOG.find((m) => m.provider === 'openai')?.model ?? '',
      ollama:    '',
    }
    const p = settings?.defaultProvider
    if (p) defaults[p] = settings?.defaultModel ?? defaults[p]
    return defaults
  })
  const detected = detectPersonality(settings?.personalityPrompt ?? '')
  const [personality, setPersonality] = useState<Personality | null>(detected.personality)
  const [customPrompt, setCustomPrompt] = useState(settings?.customPersonalityPrompt ?? '')

  // --- Auto-save infrastructure ---
  const pendingRef = useRef<Partial<Settings>>({})
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const ownSaveRef = useRef(false)

  const save = useCallback(async (partial: Partial<Settings>) => {
    ownSaveRef.current = true
    await update(partial)
    if ('quickPromptHotkey' in partial) window.api.notifyHotkeyChanged()
    if ('runInBackground' in partial) window.api.notifyBackgroundChanged()
  }, [update])

  const debouncedSave = useCallback((partial: Partial<Settings>) => {
    pendingRef.current = { ...pendingRef.current, ...partial }
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      save(pendingRef.current)
      pendingRef.current = {}
      debounceRef.current = null
    }, 600)
  }, [save])

  // Flush pending saves on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
        if (Object.keys(pendingRef.current).length > 0) {
          save(pendingRef.current)
          pendingRef.current = {}
        }
      }
    }
  }, [save])

  useEffect(() => {
    if (settings) {
      // Skip form reset when the store update came from our own save —
      // we already have the correct form state locally
      if (ownSaveRef.current) {
        ownSaveRef.current = false
        return
      }
      setForm(settings)
      setArgsText({})
    }
  }, [settings])

  useEffect(() => {
    window.api.getDataFolder().then(setDataFolder).catch(() => {})
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose() }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  useEffect(() => {
    if (tab !== 'advanced') return
    window.api.getMcpStatus().then(setMcpStatus).catch(() => {})
    const id = setInterval(() => {
      window.api.getMcpStatus().then(setMcpStatus).catch(() => {})
    }, 2000)
    return () => clearInterval(id)
  }, [tab])

  const set = (key: keyof Settings, value: string): void => {
    setForm((f) => ({ ...f, [key]: value }))
    debouncedSave({ [key]: value })
  }

  const addMcp = (): void => {
    const updated = [...(form.mcpServers ?? []), { name: '', command: '', args: [], enabled: true }]
    setForm((f) => ({ ...f, mcpServers: updated }))
    save({ mcpServers: updated })
  }

  const handleAddFromCatalog = (server: MCPServerConfig): void => {
    const updated = [...(form.mcpServers ?? []), server]
    setForm((f) => ({ ...f, mcpServers: updated }))
    save({ mcpServers: updated })
  }

  const removeMcp = (i: number): void => {
    const updated = (form.mcpServers ?? []).filter((_, idx) => idx !== i)
    setForm((f) => ({ ...f, mcpServers: updated }))
    save({ mcpServers: updated })
  }

  const updateMcp = (i: number, key: keyof MCPServerConfig, val: string | boolean): void => {
    const updated = (form.mcpServers ?? []).map((s, idx) => (idx === i ? { ...s, [key]: val } : s))
    setForm((f) => ({ ...f, mcpServers: updated }))
    if (typeof val === 'boolean') {
      save({ mcpServers: updated })
    } else {
      debouncedSave({ mcpServers: updated })
    }
  }

  const updateMcpArgs = (i: number, raw: string): void => {
    setArgsText((t) => ({ ...t, [i]: raw }))
    const updated = (form.mcpServers ?? []).map((s, idx) => (idx === i ? { ...s, args: raw.split(' ').filter(Boolean) } : s))
    setForm((f) => ({ ...f, mcpServers: updated }))
    debouncedSave({ mcpServers: updated })
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
                {/* API Keys — always visible */}
                <Label>Anthropic API Key</Label>
                <div className="mb-3">
                  <SensitiveInput
                    value={form.anthropicApiKey}
                    onChange={(v) => set('anthropicApiKey', v)}
                    placeholder="sk-ant-..."
                  />
                </div>

                <Label>OpenAI API Key</Label>
                <p className="text-xs mb-1.5" style={{ color: 'var(--muted)', opacity: 0.6 }}>Also enables image generation and voice</p>
                <div className="mb-3">
                  <SensitiveInput
                    value={form.openaiApiKey}
                    onChange={(v) => set('openaiApiKey', v)}
                    placeholder="sk-..."
                  />
                </div>

                <Label>Ollama Base URL</Label>
                <div className="mb-4">
                  <input
                    type="text"
                    value={form.ollamaBaseUrl}
                    onChange={(e) => set('ollamaBaseUrl', e.target.value)}
                    placeholder="http://localhost:11434"
                    className={inputCls}
                    style={inputStyle}
                  />
                </div>

                {/* Default Model */}
                <div className="mb-4">
                  <Label>Default Model</Label>
                  {!form.anthropicApiKey && !form.openaiApiKey && !form.ollamaBaseUrl ? (
                    <div className={`${inputCls} font-mono`} style={{ ...inputStyle, color: 'var(--muted)' }}>
                      Add an API key above to see available models
                    </div>
                  ) : (
                    <div>
                      {/* Provider tabs */}
                      <div className="flex gap-1 mb-2">
                        {([
                          { id: 'anthropic' as Provider, label: 'Anthropic', enabled: !!form.anthropicApiKey },
                          { id: 'openai' as Provider, label: 'OpenAI', enabled: !!form.openaiApiKey },
                          { id: 'ollama' as Provider, label: 'Ollama', enabled: !!form.ollamaBaseUrl },
                        ]).filter((p) => p.enabled).map((p) => (
                          <button
                            key={p.id}
                            onClick={() => {
                              setModelProviderTab(p.id)
                              setUseCustomModel(false)
                              const model = providerModels[p.id] || MODEL_CATALOG.find((m) => m.provider === p.id)?.model || ''
                              setForm((f) => ({ ...f, defaultModel: model, defaultProvider: p.id }))
                              save({ defaultModel: model, defaultProvider: p.id })
                            }}
                            className="px-3 py-1 rounded-md text-xs font-medium transition-colors"
                            style={{
                              background: modelProviderTab === p.id ? 'var(--accent)' : 'var(--bg)',
                              color: modelProviderTab === p.id ? '#fff' : 'var(--muted)',
                              border: `1px solid ${modelProviderTab === p.id ? 'var(--accent)' : 'var(--border)'}`,
                              cursor: 'pointer'
                            }}
                          >
                            {p.label}
                          </button>
                        ))}
                      </div>

                      {/* Models for selected provider */}
                      {useCustomModel ? (
                        <div>
                          <input
                            type="text"
                            value={form.defaultModel}
                            onChange={(e) => set('defaultModel', e.target.value)}
                            placeholder="e.g. claude-sonnet-4-6, gpt-4o, llama3.2"
                            className={`${inputCls} font-mono`}
                            style={inputStyle}
                          />
                          <button
                            className="text-xs mt-2"
                            style={{ color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer' }}
                            onClick={() => setUseCustomModel(false)}
                          >
                            Back to model list
                          </button>
                        </div>
                      ) : modelProviderTab === 'ollama' ? (
                        <input
                          type="text"
                          value={providerModels.ollama}
                          onChange={(e) => {
                            setProviderModels((prev) => ({ ...prev, ollama: e.target.value }))
                            setForm((f) => ({ ...f, defaultModel: e.target.value, defaultProvider: 'ollama' }))
                            debouncedSave({ defaultModel: e.target.value, defaultProvider: 'ollama' })
                          }}
                          placeholder="e.g. llama3.2"
                          className={`${inputCls} font-mono`}
                          style={inputStyle}
                        />
                      ) : (
                        <div className="relative">
                          <select
                            value={providerModels[modelProviderTab]}
                            onChange={(e) => {
                              const model = e.target.value
                              setProviderModels((prev) => ({ ...prev, [modelProviderTab]: model }))
                              setForm((f) => ({ ...f, defaultModel: model, defaultProvider: modelProviderTab }))
                              save({ defaultModel: model, defaultProvider: modelProviderTab })
                            }}
                            className={`${inputCls} appearance-none pr-8`}
                            style={inputStyle}
                          >
                            {MODEL_CATALOG.filter((m) => m.provider === modelProviderTab).map((m) => (
                              <option key={m.id} value={m.model}>{m.label}</option>
                            ))}
                          </select>
                          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-base" style={{ color: 'var(--muted)' }}>▾</span>
                        </div>
                      )}

                      {!useCustomModel && (
                        <button
                          className="text-xs mt-2 text-left"
                          style={{ color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                          onClick={() => setUseCustomModel(true)}
                        >
                          Use custom model ID…
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* OpenAI Features — shown when OpenAI key is set */}
                {form.openaiApiKey && (
                  <div
                    className="rounded-lg p-3"
                    style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}
                  >
                    <p className="text-xs font-medium mb-1" style={{ color: 'var(--text)' }}>OpenAI Features</p>
                    <p className="text-xs mb-3" style={{ color: 'var(--muted)' }}>
                      Image generation and voice mode are enabled with your OpenAI key.
                    </p>

                    <label className="flex items-center justify-between cursor-pointer mb-3">
                      <span className="text-xs" style={{ color: 'var(--muted)' }}>Auto-play responses after voice input</span>
                      <input
                        type="checkbox"
                        checked={form.voiceAutoPlay ?? false}
                        onChange={(e) => {
                          setForm((f) => ({ ...f, voiceAutoPlay: e.target.checked }))
                          save({ voiceAutoPlay: e.target.checked })
                        }}
                      />
                    </label>

                    <Label>TTS Model</Label>
                    <div className="flex gap-2 mb-3">
                      {([['tts-1', 'Standard'], ['tts-1-hd', 'HD']] as const).map(([id, label]) => (
                        <button
                          key={id}
                          onClick={() => {
                            setForm((f) => ({ ...f, voiceModel: id }))
                            save({ voiceModel: id })
                          }}
                          className="flex-1 py-1.5 rounded-md text-xs transition-colors"
                          style={{
                            background: (form.voiceModel ?? 'tts-1') === id ? 'var(--accent)' : 'var(--surface)',
                            color: (form.voiceModel ?? 'tts-1') === id ? 'white' : 'var(--muted)',
                            border: '1px solid var(--border)'
                          }}
                        >
                          {label}
                        </button>
                      ))}
                    </div>

                    <Label>Voice</Label>
                    <div className="grid grid-cols-3 gap-1.5">
                      {(['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'] as const).map((v) => (
                        <button
                          key={v}
                          onClick={() => {
                            setForm((f) => ({ ...f, voiceVoice: v }))
                            save({ voiceVoice: v })
                          }}
                          className="py-1.5 rounded-md text-xs capitalize transition-colors"
                          style={{
                            background: (form.voiceVoice ?? 'nova') === v ? 'var(--accent)' : 'var(--surface)',
                            color: (form.voiceVoice ?? 'nova') === v ? 'white' : 'var(--muted)',
                            border: '1px solid var(--border)'
                          }}
                        >
                          {v}
                        </button>
                      ))}
                    </div>
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
                      onClick={() => {
                        setPersonality(id)
                        if (id !== 'custom') {
                          setForm((f) => ({ ...f, personalityPrompt: PERSONALITY_PROMPTS[id] }))
                          save({ personalityPrompt: PERSONALITY_PROMPTS[id] })
                        } else {
                          const saved = form.customPersonalityPrompt ?? ''
                          setCustomPrompt(saved)
                          setForm((f) => ({ ...f, personalityPrompt: saved }))
                          save({ personalityPrompt: saved })
                        }
                      }}
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
                    onChange={(e) => {
                      const text = e.target.value
                      setCustomPrompt(text)
                      setForm((f) => ({ ...f, personalityPrompt: text, customPersonalityPrompt: text }))
                      debouncedSave({ personalityPrompt: text, customPersonalityPrompt: text })
                    }}
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
                        onClick={() => {
                          setForm((f) => ({ ...f, theme: t }))
                          save({ theme: t })
                        }}
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

                <div className="mt-5">
                  <Label>Memories</Label>
                  {(form.memories ?? []).length === 0 ? (
                    <p className="text-xs" style={{ color: 'var(--muted)' }}>
                      No memories yet. April will save things she learns about you during conversations.
                    </p>
                  ) : (
                    <div className="overflow-y-auto space-y-1" style={{ maxHeight: '12rem' }}>
                      {(form.memories ?? []).map((m) => (
                        <div
                          key={m.id}
                          className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-md"
                          style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}
                        >
                          <span className="text-xs truncate" style={{ color: 'var(--text)' }}>{m.content}</span>
                          <button
                            onClick={() => {
                              const updated = (form.memories ?? []).filter((x) => x.id !== m.id)
                              setForm((f) => ({ ...f, memories: updated }))
                              save({ memories: updated })
                            }}
                            className="shrink-0 hover:opacity-80"
                            style={{ color: 'var(--muted)' }}
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}

            {/* ── Advanced ── */}
            {tab === 'advanced' && (
              <>
                {/* Run in Background */}
                <div className="mb-5">
                  <label className="flex items-center justify-between cursor-pointer">
                    <div>
                      <div className="text-xs font-medium" style={{ color: 'var(--muted)' }}>Run in Background</div>
                      <div className="text-xs mt-0.5" style={{ color: 'var(--muted)', opacity: 0.6 }}>
                        Keep running in background when window is closed (required for reminders)
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={form.runInBackground ?? true}
                      onChange={(e) => {
                        setForm((f) => ({ ...f, runInBackground: e.target.checked }))
                        save({ runInBackground: e.target.checked })
                      }}
                      className="ml-3"
                    />
                  </label>
                </div>

                {/* Recent Context */}
                <div className="mb-5">
                  <Label>Recent context</Label>
                  <p className="text-xs mb-2" style={{ color: 'var(--muted)' }}>
                    How many recent exchanges to keep in full before summarising older messages. Higher = more context but more tokens.
                  </p>
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min={3}
                      max={20}
                      step={1}
                      value={form.recentContextExchanges ?? 8}
                      onChange={(e) => {
                        const val = Number(e.target.value)
                        setForm((f) => ({ ...f, recentContextExchanges: val }))
                        debouncedSave({ recentContextExchanges: val })
                      }}
                      className="flex-1"
                    />
                    <span className="text-xs tabular-nums" style={{ color: 'var(--muted)', minWidth: '7.5em' }}>
                      {form.recentContextExchanges ?? 8} exchanges
                    </span>
                  </div>
                </div>

                {/* ntfy.sh Topic */}
                <div className="mb-5">
                  <Label>ntfy.sh Topic</Label>
                  <p className="text-xs mb-2" style={{ color: 'var(--muted)' }}>
                    Get reminders on your phone via ntfy.sh — enter a topic name (e.g. <code>april-reminders</code>). Leave empty to disable.
                  </p>
                  <input
                    type="text"
                    value={form.ntfyTopic ?? ''}
                    onChange={(e) => set('ntfyTopic', e.target.value)}
                    placeholder="e.g. april-reminders"
                    className={inputCls}
                    style={inputStyle}
                  />
                </div>

                {/* Quick Prompt Hotkey */}
                <div className="mb-5">
                  <Label>Quick Prompt Hotkey</Label>
                  <p className="text-xs mb-2" style={{ color: 'var(--muted)' }}>
                    Global shortcut to open the quick prompt overlay from any app.
                  </p>
                  <HotkeyRecorder
                    value={form.quickPromptHotkey || 'CmdOrCtrl+Shift+Space'}
                    onChange={(v) => {
                      setForm((f) => ({ ...f, quickPromptHotkey: v }))
                      save({ quickPromptHotkey: v })
                    }}
                  />
                </div>

                {/* Command Palette Hotkey */}
                <div className="mb-5">
                  <Label>Command Palette Hotkey</Label>
                  <p className="text-xs mb-2" style={{ color: 'var(--muted)' }}>
                    Open the command palette to search conversations and run commands.
                  </p>
                  <HotkeyRecorder
                    value={form.quickSwitcherHotkey || 'CmdOrCtrl+K'}
                    onChange={(v) => {
                      setForm((f) => ({ ...f, quickSwitcherHotkey: v }))
                      debouncedSave({ quickSwitcherHotkey: v })
                    }}
                  />
                </div>

                {/* Data Folder */}
                <div className="mb-5">
                  <Label>Data Folder</Label>
                  <p className="text-xs mb-2" style={{ color: 'var(--muted)' }}>
                    Conversations and settings are stored here. Point to an iCloud Drive or Dropbox folder to sync across devices.
                  </p>
                  <div className="flex gap-2">
                    <div
                      className="flex-1 px-3 py-2 rounded-md text-xs font-mono truncate"
                      style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }}
                      title={dataFolder}
                    >
                      {dataFolder || 'Loading...'}
                    </div>
                    <button
                      onClick={async () => {
                        const picked = await window.api.pickDataFolder()
                        if (picked) {
                          setDataFolder(picked)
                        }
                      }}
                      className="px-3 py-2 rounded-md text-xs transition-colors hover:opacity-80 shrink-0"
                      style={{ color: 'var(--accent)', background: 'rgba(59,130,246,0.08)' }}
                    >
                      Change...
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between mb-3">
                  <div>
                    <Label>MCP Servers</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setShowCatalog(true)}
                      className="text-xs px-2 py-1 rounded-md transition-colors hover:opacity-80"
                      style={{ color: 'var(--accent)', background: 'rgba(59,130,246,0.08)' }}
                    >
                      Browse catalog
                    </button>
                    <button
                      onClick={addMcp}
                      className="flex items-center gap-1 text-xs px-2 py-1 rounded-md transition-colors hover:opacity-80"
                      style={{ color: 'var(--muted)', background: 'var(--bg)', border: '1px solid var(--border)' }}
                    >
                      <Plus size={12} /> Custom
                    </button>
                  </div>
                </div>

                {(form.mcpServers ?? []).length === 0 ? (
                  <div>
                    <p className="text-xs mb-1" style={{ color: 'var(--muted)' }}>No MCP servers configured.</p>
                    <p className="text-xs" style={{ color: 'var(--muted)', opacity: 0.6 }}>
                      MCP servers extend April with custom tools. Add a server command and args, enable it, then save.
                    </p>
                  </div>
                ) : (
                  (form.mcpServers ?? []).map((srv, i) => {
                    const status = mcpStatus.find((s) => s.name === srv.name)
                    return (
                      <div
                        key={i}
                        className="mb-3 p-3 rounded-md"
                        style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            {status ? (
                              status.connected ? (
                                <CheckCircle size={11} style={{ color: '#22c55e' }} />
                              ) : status.error ? (
                                <AlertCircle size={11} style={{ color: '#ef4444' }} />
                              ) : (
                                <Loader size={11} style={{ color: 'var(--muted)' }} />
                              )
                            ) : null}
                            <span className="text-xs font-medium" style={{ color: 'var(--text)' }}>
                              {srv.name || `Server ${i + 1}`}
                            </span>
                            {status?.connected && (
                              <span className="text-xs" style={{ color: 'var(--muted)' }}>
                                {status.toolCount} tool{status.toolCount !== 1 ? 's' : ''}
                              </span>
                            )}
                            {status?.error && !status.connected && (
                              <span className="text-xs truncate max-w-32" style={{ color: '#ef4444' }} title={status.error}>
                                {status.error}
                              </span>
                            )}
                          </div>
                          <button onClick={() => removeMcp(i)} className="hover:opacity-80" style={{ color: 'var(--muted)' }}>
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
                            placeholder="Command (e.g. npx, uvx)"
                            value={srv.command}
                            onChange={(e) => updateMcp(i, 'command', e.target.value)}
                            className="px-2 py-1 rounded text-xs outline-none"
                            style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}
                          />
                        </div>
                        <input
                          placeholder="Args (space-separated, e.g. @modelcontextprotocol/server-filesystem /path)"
                          value={argsText[i] ?? srv.args.join(' ')}
                          onChange={(e) => updateMcpArgs(i, e.target.value)}
                          className="mt-2 w-full px-2 py-1 rounded text-xs outline-none font-mono"
                          style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}
                        />
                        <label className="flex items-center gap-2 mt-2 text-xs cursor-pointer" style={{ color: 'var(--muted)' }}>
                          <input
                            type="checkbox"
                            checked={srv.enabled}
                            onChange={(e) => updateMcp(i, 'enabled', e.target.checked)}
                          />
                          Enabled
                        </label>
                      </div>
                    )
                  })
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {showCatalog && (
        <MCPCatalog
          onAdd={handleAddFromCatalog}
          onClose={() => setShowCatalog(false)}
        />
      )}
    </div>
  )
}
