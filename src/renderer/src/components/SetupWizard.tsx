import { useEffect, useState } from 'react'
import { Check } from 'lucide-react'
import { useSettingsStore } from '../stores/settings'
import type { Provider } from '../types'

type Step = 1 | 2 | 3 | 4 | 'done'
type Personality = 'professional' | 'friendly' | 'creative' | 'concise' | 'custom'

const PERSONALITY_PROMPTS: Record<Exclude<Personality, 'custom'>, string> = {
  professional:
    'Communicate formally and precisely. Keep responses well-structured and focused on the task. Avoid small talk.',
  friendly: 'Communicate warmly and conversationally. Be encouraging and personable.',
  creative:
    'Bring imagination and enthusiasm to everything. Think expansively and embrace creative exploration.',
  concise:
    'Always be brief. Get to the point immediately. Use as few words as possible while remaining accurate.'
}

const PERSONALITIES: { id: Personality; label: string; description: string }[] = [
  { id: 'professional', label: 'Professional', description: 'Formal and structured' },
  { id: 'friendly', label: 'Friendly', description: 'Warm and conversational' },
  { id: 'creative', label: 'Creative', description: 'Imaginative and expansive' },
  { id: 'concise', label: 'Concise', description: 'Brief and to the point' },
  { id: 'custom', label: 'Custom', description: 'Write your own' }
]

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  borderRadius: '6px',
  border: '1px solid var(--border)',
  background: 'var(--bg)',
  color: 'var(--text)',
  fontSize: '14px',
  outline: 'none'
}

const primaryBtnStyle: React.CSSProperties = {
  background: 'var(--accent)',
  color: '#fff',
  border: 'none',
  padding: '8px 16px',
  borderRadius: '8px',
  fontSize: '14px',
  fontWeight: 500,
  cursor: 'pointer'
}

const skipBtnStyle: React.CSSProperties = {
  color: 'var(--muted)',
  background: 'none',
  border: 'none',
  fontSize: '13px',
  cursor: 'pointer',
  padding: '4px'
}

export function SetupWizard(): JSX.Element {
  const { settings, update } = useSettingsStore()

  const [step, setStep] = useState<Step>(1)
  const [provider, setProvider] = useState<Provider>(settings?.defaultProvider ?? 'anthropic')
  const [apiKey, setApiKey] = useState('')
  const [ollamaUrl, setOllamaUrl] = useState(settings?.ollamaBaseUrl ?? 'http://localhost:11434')
  const [model, setModel] = useState(settings?.defaultModel ?? '')
  const [models, setModels] = useState<string[]>([])
  const [modelInputFailed, setModelInputFailed] = useState(false)
  const [enableImages, setEnableImages] = useState(false)
  const [imageKey, setImageKey] = useState('')
  const [personality, setPersonality] = useState<Personality>('friendly')
  const [customPrompt, setCustomPrompt] = useState(PERSONALITY_PROMPTS.friendly)

  // Load models when provider changes in step 2 (Ollama always uses free text)
  useEffect(() => {
    if (step !== 2) return
    setModels([])
    setModelInputFailed(false)
    if (provider === 'ollama') {
      setModel('')
      return
    }
    window.api
      .listModels(provider)
      .then((list) => {
        if (list.length > 0) {
          setModels(list)
          if (!model || !list.includes(model)) setModel(list[0])
        } else {
          setModelInputFailed(true)
        }
      })
      .catch(() => setModelInputFailed(true))
  }, [provider, step])

  async function skipSetup(): Promise<void> {
    await update({ setupCompleted: true })
  }

  async function handleStep2Continue(): Promise<void> {
    const partial: Parameters<typeof update>[0] = {
      defaultProvider: provider,
      defaultModel: model
    }
    if (provider === 'anthropic') partial.anthropicApiKey = apiKey
    else if (provider === 'openai') partial.openaiApiKey = apiKey
    else partial.ollamaBaseUrl = ollamaUrl
    await update(partial)
    setStep(3)
  }

  async function handleStep3Continue(): Promise<void> {
    if (enableImages && imageKey) {
      await update({ openaiApiKey: imageKey })
    }
    setStep(4)
  }

  async function handleFinish(): Promise<void> {
    const base = settings?.systemPrompt ?? ''
    const addition = personality === 'custom' ? customPrompt : PERSONALITY_PROMPTS[personality]
    const newPrompt = base.trimEnd() + '\n\n' + addition
    await update({ systemPrompt: newPrompt, setupCompleted: true })
    setStep('done')
  }

  const step2Valid =
    provider === 'ollama' ? ollamaUrl.trim().length > 0 : apiKey.trim().length > 0

  const providerHasOpenAiKey = !!(settings?.openaiApiKey)

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg)'
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '512px',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: '12px',
          overflow: 'hidden'
        }}
      >
        {/* Progress bar (steps 2-4) */}
        {step !== 1 && step !== 'done' && (
          <div style={{ height: '4px', background: 'var(--border)' }}>
            <div
              style={{
                height: '100%',
                background: 'var(--accent)',
                width: `${((Number(step) - 1) / 3) * 100}%`,
                transition: 'width 0.3s ease'
              }}
            />
          </div>
        )}

        <div style={{ padding: '32px' }}>
          {/* Step counter + skip */}
          {step !== 'done' && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '24px', gap: '12px', alignItems: 'center' }}>
              {typeof step === 'number' && (
                <span style={{ fontSize: '12px', color: 'var(--muted)' }}>
                  Step {step} of 4
                </span>
              )}
              <button style={skipBtnStyle} onClick={skipSetup}>
                Skip setup
              </button>
            </div>
          )}

          {/* ── Step 1: Welcome ── */}
          {step === 1 && (
            <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
              <img src="./favicon.png" alt="April" style={{ width: '80px', height: '80px' }} />
              <h1 style={{ fontSize: '24px', fontWeight: 600, color: 'var(--text)', margin: 0 }}>
                Welcome to April
              </h1>
              <p style={{ fontSize: '14px', color: 'var(--muted)', margin: 0 }}>
                Your personal AI assistant. Let's get you set up.
              </p>
              <button style={{ ...primaryBtnStyle, marginTop: '8px' }} onClick={() => setStep(2)}>
                Get Started →
              </button>
            </div>
          )}

          {/* ── Step 2: Provider ── */}
          {step === 2 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div>
                <h2 style={{ fontSize: '20px', fontWeight: 600, color: 'var(--text)', margin: '0 0 4px' }}>
                  Choose your AI provider
                </h2>
                <p style={{ fontSize: '14px', color: 'var(--muted)', margin: 0 }}>
                  Select a provider and enter your credentials.
                </p>
              </div>

              {/* Provider cards */}
              <div style={{ display: 'flex', gap: '12px' }}>
                {(['anthropic', 'openai', 'ollama'] as Provider[]).map((p) => (
                  <button
                    key={p}
                    onClick={() => setProvider(p)}
                    style={{
                      flex: 1,
                      padding: '12px 8px',
                      borderRadius: '8px',
                      border: provider === p ? '2px solid var(--accent)' : '1px solid var(--border)',
                      background: 'var(--bg)',
                      color: 'var(--text)',
                      fontSize: '13px',
                      fontWeight: 500,
                      cursor: 'pointer',
                      textAlign: 'center'
                    }}
                  >
                    {p === 'anthropic' ? 'Anthropic' : p === 'openai' ? 'OpenAI' : 'Ollama'}
                  </button>
                ))}
              </div>

              {/* Credential input */}
              {provider === 'anthropic' && (
                <input
                  type="password"
                  placeholder="Anthropic API key (sk-ant-...)"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  style={inputStyle}
                />
              )}
              {provider === 'openai' && (
                <input
                  type="password"
                  placeholder="OpenAI API key (sk-...)"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  style={inputStyle}
                />
              )}
              {provider === 'ollama' && (
                <input
                  type="text"
                  placeholder="Ollama base URL"
                  value={ollamaUrl}
                  onChange={(e) => setOllamaUrl(e.target.value)}
                  style={inputStyle}
                />
              )}

              {/* Model picker */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '13px', color: 'var(--muted)' }}>Model</label>
                {provider === 'ollama' ? (
                  <input
                    type="text"
                    placeholder="e.g. llama3.2, mistral, phi3"
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    style={inputStyle}
                  />
                ) : modelInputFailed ? (
                  <input
                    type="text"
                    placeholder="Enter model name"
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    style={inputStyle}
                  />
                ) : models.length > 0 ? (
                  <div style={{ position: 'relative' }}>
                    <select
                      value={model}
                      onChange={(e) => setModel(e.target.value)}
                      style={{ ...inputStyle, appearance: 'none', paddingRight: '2rem', cursor: 'pointer' }}
                    >
                      {models.map((m) => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                    <span
                      style={{
                        position: 'absolute',
                        right: '10px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        pointerEvents: 'none',
                        color: 'var(--muted)',
                        fontSize: '12px'
                      }}
                    >
                      ▾
                    </span>
                  </div>
                ) : (
                  <div style={{ ...inputStyle, color: 'var(--muted)', cursor: 'default' }}>
                    Loading models…
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  style={{ ...primaryBtnStyle, opacity: step2Valid ? 1 : 0.5, cursor: step2Valid ? 'pointer' : 'default' }}
                  disabled={!step2Valid}
                  onClick={handleStep2Continue}
                >
                  Continue →
                </button>
              </div>
            </div>
          )}

          {/* ── Step 3: Image Generation ── */}
          {step === 3 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div>
                <h2 style={{ fontSize: '20px', fontWeight: 600, color: 'var(--text)', margin: '0 0 4px' }}>
                  Want April to generate images?
                </h2>
                <p style={{ fontSize: '14px', color: 'var(--muted)', margin: 0 }}>
                  April can create images from your descriptions using OpenAI's image models. This
                  always uses OpenAI regardless of your active provider.
                </p>
              </div>

              {/* Toggle */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <button
                  onClick={() => setEnableImages(!enableImages)}
                  style={{
                    width: '48px',
                    height: '26px',
                    borderRadius: '13px',
                    border: 'none',
                    background: enableImages ? 'var(--accent)' : 'var(--border)',
                    cursor: 'pointer',
                    position: 'relative',
                    transition: 'background 0.2s'
                  }}
                >
                  <span
                    style={{
                      position: 'absolute',
                      top: '3px',
                      left: enableImages ? '25px' : '3px',
                      width: '20px',
                      height: '20px',
                      borderRadius: '50%',
                      background: '#fff',
                      transition: 'left 0.2s'
                    }}
                  />
                </button>
                <span style={{ fontSize: '14px', color: 'var(--text)' }}>
                  {enableImages ? 'Enabled' : 'Disabled'}
                </span>
              </div>

              {enableImages && (
                providerHasOpenAiKey ? (
                  <p style={{ fontSize: '14px', color: 'var(--muted)', margin: 0 }}>
                    ✓ OpenAI key already configured
                  </p>
                ) : (
                  <input
                    type="password"
                    placeholder="OpenAI API key (sk-...)"
                    value={imageKey}
                    onChange={(e) => setImageKey(e.target.value)}
                    style={inputStyle}
                  />
                )
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button style={primaryBtnStyle} onClick={handleStep3Continue}>
                  Continue →
                </button>
              </div>
            </div>
          )}

          {/* ── Step 4: Personality ── */}
          {step === 4 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div>
                <h2 style={{ fontSize: '20px', fontWeight: 600, color: 'var(--text)', margin: '0 0 4px' }}>
                  How should April communicate?
                </h2>
                <p style={{ fontSize: '14px', color: 'var(--muted)', margin: 0 }}>
                  Choose a communication style. You can change this later in Settings.
                </p>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
                {PERSONALITIES.map(({ id, label, description }) => (
                  <button
                    key={id}
                    onClick={() => setPersonality(id)}
                    style={{
                      padding: '14px 10px',
                      borderRadius: '8px',
                      border: personality === id ? '2px solid var(--accent)' : '1px solid var(--border)',
                      background: 'var(--bg)',
                      color: 'var(--text)',
                      cursor: 'pointer',
                      textAlign: 'left'
                    }}
                  >
                    <div style={{ fontWeight: 600, fontSize: '13px', marginBottom: '3px' }}>{label}</div>
                    <div style={{ fontSize: '11px', color: 'var(--muted)' }}>{description}</div>
                  </button>
                ))}
              </div>
              {personality === 'custom' && (
                <textarea
                  value={customPrompt}
                  onChange={(e) => setCustomPrompt(e.target.value)}
                  rows={3}
                  placeholder="Describe how April should communicate…"
                  style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
                />
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button style={primaryBtnStyle} onClick={handleFinish}>
                  Finish Setup →
                </button>
              </div>
            </div>
          )}

          {/* ── Done ── */}
          {step === 'done' && (
            <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
              <Check size={48} color="var(--accent)" />
              <h2 style={{ fontSize: '22px', fontWeight: 600, color: 'var(--text)', margin: 0 }}>
                You're all set!
              </h2>
              <p style={{ fontSize: '14px', color: 'var(--muted)', margin: 0 }}>
                April is ready.{' '}
                <span style={{ color: 'var(--text)' }}>
                  {provider.charAt(0).toUpperCase() + provider.slice(1)} · {model}
                </span>
              </p>
              <button
                style={{ ...primaryBtnStyle, marginTop: '8px' }}
                onClick={() => {
                  /* wizard unmounts because setupCompleted is true */
                }}
              >
                Start chatting →
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
