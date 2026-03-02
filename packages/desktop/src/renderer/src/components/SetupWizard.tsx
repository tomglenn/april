import { useState } from 'react'
import { Check, Eye, EyeOff } from 'lucide-react'
import { useSettingsStore } from '../stores/settings'
import type { Provider } from '../types'
import { useMultiProviderModels } from '../hooks/useMultiProviderModels'

type Step = 1 | 2 | 3 | 4 | 5 | 'done'
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

function WizardKeyInput({
  value,
  onChange,
  placeholder,
  type = 'password'
}: {
  value: string
  onChange: (v: string) => void
  placeholder: string
  type?: 'text' | 'password'
}): JSX.Element {
  const [show, setShow] = useState(false)
  if (type === 'text') {
    return <input type="text" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} style={inputStyle} />
  }
  return (
    <div style={{ position: 'relative' }}>
      <input
        type={show ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{ ...inputStyle, paddingRight: '2.5rem' }}
      />
      <button
        onClick={() => setShow((v) => !v)}
        style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer' }}
      >
        {show ? <EyeOff size={14} /> : <Eye size={14} />}
      </button>
    </div>
  )
}

export function SetupWizard(): JSX.Element {
  const { settings, update } = useSettingsStore()

  const [step, setStep] = useState<Step>(1)
  const [anthropicKey, setAnthropicKey] = useState(settings?.anthropicApiKey ?? '')
  const [openaiKey, setOpenaiKey] = useState(settings?.openaiApiKey ?? '')
  const [ollamaUrl, setOllamaUrl] = useState(settings?.ollamaBaseUrl ?? 'http://localhost:11434')
  const [selectedModel, setSelectedModel] = useState('')
  const [selectedProvider, setSelectedProvider] = useState<Provider>('anthropic')
  const [useCustomModel, setUseCustomModel] = useState(false)
  const [customModelName, setCustomModelName] = useState('')
  const [customProvider, setCustomProvider] = useState<Provider>('anthropic')
  const [userName, setUserName] = useState(settings?.userName ?? '')
  const [userLocation, setUserLocation] = useState(settings?.userLocation ?? '')
  const [userBio, setUserBio] = useState(settings?.userBio ?? '')
  const [personality, setPersonality] = useState<Personality>('friendly')
  const [customPrompt, setCustomPrompt] = useState(PERSONALITY_PROMPTS.friendly)

  const { groups, allEmpty } = useMultiProviderModels({
    anthropicApiKey: anthropicKey,
    openaiApiKey: openaiKey,
    ollamaBaseUrl: ollamaUrl
  })

  const step2Valid = !!(anthropicKey.trim() || openaiKey.trim() || ollamaUrl.trim())

  const step3Valid = useCustomModel
    ? customModelName.trim().length > 0
    : selectedModel.length > 0

  const displayProvider = useCustomModel ? customProvider : selectedProvider
  const displayModel = useCustomModel ? customModelName : selectedModel

  async function skipSetup(): Promise<void> {
    await update({ setupCompleted: true })
  }

  async function handleStep2Continue(): Promise<void> {
    const partial: Parameters<typeof update>[0] = {}
    if (anthropicKey.trim()) partial.anthropicApiKey = anthropicKey.trim()
    if (openaiKey.trim()) partial.openaiApiKey = openaiKey.trim()
    if (ollamaUrl.trim()) partial.ollamaBaseUrl = ollamaUrl.trim()
    await update(partial)
    setStep(3)
  }

  async function handleStep3Continue(): Promise<void> {
    await update({
      defaultProvider: displayProvider,
      defaultModel: displayModel
    })
    setStep(4)
  }

  async function handleStep4Continue(): Promise<void> {
    await update({ userName: userName.trim(), userLocation: userLocation.trim(), userBio: userBio.trim() })
    setStep(5)
  }

  async function handleFinish(): Promise<void> {
    const personalityPrompt = personality === 'custom' ? customPrompt : PERSONALITY_PROMPTS[personality]
    await update({ personalityPrompt, setupCompleted: true })
    setStep('done')
  }

  function handleModelSelect(value: string): void {
    if (value === '__custom__') {
      setUseCustomModel(true)
      return
    }
    setUseCustomModel(false)
    const [prov, ...rest] = value.split(':')
    setSelectedProvider(prov as Provider)
    setSelectedModel(rest.join(':'))
  }

  const providerLabel = (p: Provider): string =>
    p === 'anthropic' ? 'Anthropic' : p === 'openai' ? 'OpenAI' : 'Ollama'

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
        {/* Progress bar (steps 2-5) */}
        {step !== 1 && step !== 'done' && (
          <div style={{ height: '4px', background: 'var(--border)' }}>
            <div
              style={{
                height: '100%',
                background: 'var(--accent)',
                width: `${((Number(step) - 1) / 4) * 100}%`,
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
                  Step {step} of 5
                </span>
              )}
              <button style={skipBtnStyle} onClick={skipSetup}>
                Skip setup
              </button>
            </div>
          )}

          {/* -- Step 1: Welcome -- */}
          {step === 1 && (
            <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
              <img src="./logo.png" alt="April" style={{ width: '80px', height: '80px' }} />
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

          {/* -- Step 2: Connect your providers -- */}
          {step === 2 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div>
                <h2 style={{ fontSize: '20px', fontWeight: 600, color: 'var(--text)', margin: '0 0 4px' }}>
                  Connect your providers
                </h2>
                <p style={{ fontSize: '14px', color: 'var(--muted)', margin: 0 }}>
                  Enter credentials for any providers you'd like to use. You can always add more in Settings.
                </p>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', color: 'var(--muted)', marginBottom: '6px' }}>
                    Anthropic API Key
                  </label>
                  <WizardKeyInput
                    value={anthropicKey}
                    onChange={setAnthropicKey}
                    placeholder="sk-ant-..."
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', color: 'var(--muted)', marginBottom: '6px' }}>
                    OpenAI API Key
                    <span style={{ opacity: 0.6, fontWeight: 400 }}> — also enables image generation and voice</span>
                  </label>
                  <WizardKeyInput
                    value={openaiKey}
                    onChange={setOpenaiKey}
                    placeholder="sk-..."
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', color: 'var(--muted)', marginBottom: '6px' }}>
                    Ollama Base URL
                  </label>
                  <WizardKeyInput
                    value={ollamaUrl}
                    onChange={setOllamaUrl}
                    placeholder="http://localhost:11434"
                    type="text"
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <button style={skipBtnStyle} onClick={() => setStep(1)}>← Back</button>
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

          {/* -- Step 3: Choose your default model -- */}
          {step === 3 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div>
                <h2 style={{ fontSize: '20px', fontWeight: 600, color: 'var(--text)', margin: '0 0 4px' }}>
                  Choose your default model
                </h2>
                <p style={{ fontSize: '14px', color: 'var(--muted)', margin: 0 }}>
                  Pick a model from your configured providers, or enter a custom one.
                </p>
              </div>

              {!useCustomModel && !allEmpty && (
                <div style={{ position: 'relative' }}>
                  <select
                    value={selectedModel ? `${selectedProvider}:${selectedModel}` : ''}
                    onChange={(e) => handleModelSelect(e.target.value)}
                    style={{ ...inputStyle, appearance: 'none', paddingRight: '2rem', cursor: 'pointer' }}
                  >
                    <option value="" disabled>Select a model...</option>
                    {groups
                      .filter((g) => !g.loading && !g.failed && g.models.length > 0)
                      .map((g) => (
                        <optgroup key={g.provider} label={g.label}>
                          {g.models.map((m) => (
                            <option key={`${g.provider}:${m}`} value={`${g.provider}:${m}`}>{m}</option>
                          ))}
                        </optgroup>
                      ))}
                    <option value="__custom__">Use a custom model...</option>
                  </select>
                  <span
                    style={{
                      position: 'absolute',
                      right: '10px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      pointerEvents: 'none',
                      color: 'var(--muted)',
                      fontSize: '16px'
                    }}
                  >
                    ▾
                  </span>
                  {groups.some((g) => g.loading) && (
                    <p style={{ fontSize: '12px', color: 'var(--muted)', margin: '6px 0 0' }}>Loading models...</p>
                  )}
                </div>
              )}

              {(useCustomModel || allEmpty) && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', color: 'var(--muted)', marginBottom: '6px' }}>
                      Model name
                    </label>
                    <input
                      type="text"
                      value={customModelName}
                      onChange={(e) => setCustomModelName(e.target.value)}
                      placeholder="e.g. claude-sonnet-4-6, gpt-4o, llama3.2"
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', color: 'var(--muted)', marginBottom: '6px' }}>
                      Provider
                    </label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      {(['anthropic', 'openai', 'ollama'] as Provider[]).map((p) => (
                        <button
                          key={p}
                          onClick={() => setCustomProvider(p)}
                          style={{
                            flex: 1,
                            padding: '8px',
                            borderRadius: '6px',
                            border: customProvider === p ? '2px solid var(--accent)' : '1px solid var(--border)',
                            background: 'var(--bg)',
                            color: 'var(--text)',
                            fontSize: '13px',
                            fontWeight: 500,
                            cursor: 'pointer',
                            textAlign: 'center'
                          }}
                        >
                          {providerLabel(p)}
                        </button>
                      ))}
                    </div>
                  </div>
                  {!allEmpty && (
                    <button
                      style={{ ...skipBtnStyle, textAlign: 'left', fontSize: '12px' }}
                      onClick={() => setUseCustomModel(false)}
                    >
                      ← Back to model list
                    </button>
                  )}
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <button style={skipBtnStyle} onClick={() => setStep(2)}>← Back</button>
                <button
                  style={{ ...primaryBtnStyle, opacity: step3Valid ? 1 : 0.5, cursor: step3Valid ? 'pointer' : 'default' }}
                  disabled={!step3Valid}
                  onClick={handleStep3Continue}
                >
                  Continue →
                </button>
              </div>
            </div>
          )}

          {/* -- Step 4: About You -- */}
          {step === 4 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div>
                <h2 style={{ fontSize: '20px', fontWeight: 600, color: 'var(--text)', margin: '0 0 4px' }}>
                  A little about you
                </h2>
                <p style={{ fontSize: '14px', color: 'var(--muted)', margin: 0 }}>
                  Help April personalise its responses. All fields are optional.
                </p>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', color: 'var(--muted)', marginBottom: '6px' }}>
                    What should April call you? <span style={{ opacity: 0.6 }}>(optional)</span>
                  </label>
                  <input
                    type="text"
                    placeholder="Your name"
                    value={userName}
                    onChange={(e) => setUserName(e.target.value)}
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', color: 'var(--muted)', marginBottom: '6px' }}>
                    Where are you based? <span style={{ opacity: 0.6 }}>(optional)</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. London, UK"
                    value={userLocation}
                    onChange={(e) => setUserLocation(e.target.value)}
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', color: 'var(--muted)', marginBottom: '6px' }}>
                    Anything else April should know about you? <span style={{ opacity: 0.6 }}>(optional)</span>
                  </label>
                  <textarea
                    rows={3}
                    placeholder="e.g. I'm a software engineer who works mostly in TypeScript..."
                    value={userBio}
                    onChange={(e) => setUserBio(e.target.value)}
                    style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <button style={skipBtnStyle} onClick={() => setStep(3)}>← Back</button>
                <button style={primaryBtnStyle} onClick={handleStep4Continue}>
                  Continue →
                </button>
              </div>
            </div>
          )}

          {/* -- Step 5: Personality -- */}
          {step === 5 && (
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
                  placeholder="Describe how April should communicate..."
                  style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
                />
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <button style={skipBtnStyle} onClick={() => setStep(4)}>← Back</button>
                <button style={primaryBtnStyle} onClick={handleFinish}>
                  Finish Setup →
                </button>
              </div>
            </div>
          )}

          {/* -- Done -- */}
          {step === 'done' && (
            <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
              <Check size={48} color="var(--accent)" />
              <h2 style={{ fontSize: '22px', fontWeight: 600, color: 'var(--text)', margin: 0 }}>
                You're all set!
              </h2>
              <p style={{ fontSize: '14px', color: 'var(--muted)', margin: 0 }}>
                April is ready.{' '}
                <span style={{ color: 'var(--text)' }}>
                  {providerLabel(displayProvider)} · {displayModel}
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
