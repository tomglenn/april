import React, { useState } from 'react'
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  StyleSheet,
  Image,
  KeyboardAvoidingView,
  Platform
} from 'react-native'
import { Eye, EyeOff, Check } from 'lucide-react-native'
import { useSettingsStore } from '../stores/settings'
import { useTheme } from '../theme/ThemeProvider'
import { MODEL_CATALOG } from '../models'
import type { Provider } from '@april/core'

type Step = 1 | 2 | 3 | 4 | 5 | 'done'
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

function WizardKeyInput({
  value,
  onChange,
  placeholder,
  isPassword = true,
  colors
}: {
  value: string
  onChange: (v: string) => void
  placeholder: string
  isPassword?: boolean
  colors: ReturnType<typeof useTheme>
}): JSX.Element {
  const [show, setShow] = useState(false)

  return (
    <View style={{ position: 'relative' }}>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        secureTextEntry={isPassword && !show}
        autoCapitalize="none"
        autoCorrect={false}
        style={[styles.input, { borderColor: colors.border, backgroundColor: colors.bg, color: colors.text }]}
      />
      {isPassword && (
        <Pressable
          onPress={() => setShow((v) => !v)}
          style={{ position: 'absolute', right: 12, top: 0, bottom: 0, justifyContent: 'center' }}
        >
          {show ? <EyeOff size={16} color={colors.muted} /> : <Eye size={16} color={colors.muted} />}
        </Pressable>
      )}
    </View>
  )
}

export function SetupWizard(): JSX.Element {
  const { settings, update } = useSettingsStore()
  const colors = useTheme()

  const [step, setStep] = useState<Step>(1)
  const [anthropicKey, setAnthropicKey] = useState(settings?.anthropicApiKey ?? '')
  const [openaiKey, setOpenaiKey] = useState(settings?.openaiApiKey ?? '')
  const [selectedModel, setSelectedModel] = useState('')
  const [selectedProvider, setSelectedProvider] = useState<Provider>('anthropic')
  const [modelProviderTab, setModelProviderTab] = useState<Provider>('anthropic')
  const [providerModels, setProviderModels] = useState<Record<Provider, string>>({
    anthropic: MODEL_CATALOG.find((m) => m.provider === 'anthropic')?.model ?? '',
    openai: MODEL_CATALOG.find((m) => m.provider === 'openai')?.model ?? '',
    ollama: ''
  })
  const [userName, setUserName] = useState(settings?.userName ?? '')
  const [userLocation, setUserLocation] = useState(settings?.userLocation ?? '')
  const [userBio, setUserBio] = useState(settings?.userBio ?? '')
  const [personality, setPersonality] = useState<Personality>('friendly')
  const [customPrompt, setCustomPrompt] = useState(PERSONALITY_PROMPTS.friendly)

  const step2Valid = !!(anthropicKey.trim() || openaiKey.trim())
  const step3Valid = selectedModel.length > 0

  const displayProvider = selectedProvider
  const displayModel = selectedModel

  const providerLabel = (p: Provider): string =>
    p === 'anthropic' ? 'Anthropic' : p === 'openai' ? 'OpenAI' : 'Ollama'

  async function skipSetup(): Promise<void> {
    await update({ setupCompleted: true })
  }

  async function handleStep2Continue(): Promise<void> {
    const partial: Partial<typeof settings & object> = {}
    if (anthropicKey.trim()) partial.anthropicApiKey = anthropicKey.trim()
    if (openaiKey.trim()) partial.openaiApiKey = openaiKey.trim()
    await update(partial)
    const firstProvider: Provider = anthropicKey.trim() ? 'anthropic' : 'openai'
    setModelProviderTab(firstProvider)
    const initialModel = providerModels[firstProvider] || MODEL_CATALOG.find((m) => m.provider === firstProvider)?.model || ''
    setSelectedModel(initialModel)
    setSelectedProvider(firstProvider)
    setStep(3)
  }

  async function handleStep3Continue(): Promise<void> {
    await update({ defaultProvider: displayProvider, defaultModel: displayModel })
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

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.bg }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {/* Progress bar */}
          {step !== 1 && step !== 'done' && (
            <View style={{ height: 4, backgroundColor: colors.border }}>
              <View style={{ height: '100%', backgroundColor: colors.accent, width: `${((Number(step) - 1) / 4) * 100}%` }} />
            </View>
          )}

          <View style={styles.cardContent}>
            {/* Step counter + skip */}
            {step !== 'done' && (
              <View style={styles.headerRow}>
                {typeof step === 'number' && (
                  <Text style={{ fontSize: 12, color: colors.muted }}>Step {step} of 5</Text>
                )}
                <Pressable onPress={skipSetup}>
                  <Text style={{ fontSize: 13, color: colors.muted }}>Skip setup</Text>
                </Pressable>
              </View>
            )}

            {/* Step 1: Welcome */}
            {step === 1 && (
              <View style={styles.centerColumn}>
                <Text style={[styles.title, { color: colors.text }]}>Welcome to April</Text>
                <Text style={{ fontSize: 14, color: colors.muted, textAlign: 'center' }}>
                  Your personal AI assistant. Let's get you set up.
                </Text>
                <Pressable style={[styles.primaryBtn, { backgroundColor: colors.accent }]} onPress={() => setStep(2)}>
                  <Text style={styles.primaryBtnText}>Get Started</Text>
                </Pressable>
              </View>
            )}

            {/* Step 2: Providers */}
            {step === 2 && (
              <View style={styles.column}>
                <Text style={[styles.heading, { color: colors.text }]}>Connect your providers</Text>
                <Text style={{ fontSize: 14, color: colors.muted, marginBottom: 16 }}>
                  Enter credentials for any providers you'd like to use.
                </Text>

                <Text style={[styles.label, { color: colors.muted }]}>Anthropic API Key</Text>
                <WizardKeyInput value={anthropicKey} onChange={setAnthropicKey} placeholder="sk-ant-..." colors={colors} />

                <Text style={[styles.label, { color: colors.muted, marginTop: 12 }]}>OpenAI API Key</Text>
                <WizardKeyInput value={openaiKey} onChange={setOpenaiKey} placeholder="sk-..." colors={colors} />

                <View style={styles.navRow}>
                  <Pressable onPress={() => setStep(1)}>
                    <Text style={{ color: colors.muted }}>Back</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.primaryBtn, { backgroundColor: colors.accent, opacity: step2Valid ? 1 : 0.5 }]}
                    disabled={!step2Valid}
                    onPress={handleStep2Continue}
                  >
                    <Text style={styles.primaryBtnText}>Continue</Text>
                  </Pressable>
                </View>
              </View>
            )}

            {/* Step 3: Model */}
            {step === 3 && (
              <View style={styles.column}>
                <Text style={[styles.heading, { color: colors.text }]}>Choose your default model</Text>
                <Text style={{ fontSize: 14, color: colors.muted, marginBottom: 16 }}>
                  Pick a model from your configured providers.
                </Text>

                {/* Provider tabs */}
                <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
                  {([
                    { id: 'anthropic' as Provider, label: 'Anthropic', enabled: !!anthropicKey.trim() },
                    { id: 'openai' as Provider, label: 'OpenAI', enabled: !!openaiKey.trim() }
                  ]).filter((p) => p.enabled).map((p) => (
                    <Pressable
                      key={p.id}
                      onPress={() => {
                        setModelProviderTab(p.id)
                        const model = providerModels[p.id] || MODEL_CATALOG.find((m) => m.provider === p.id)?.model || ''
                        setSelectedModel(model)
                        setSelectedProvider(p.id)
                      }}
                      style={[styles.tab, {
                        borderColor: modelProviderTab === p.id ? colors.accent : colors.border,
                        backgroundColor: modelProviderTab === p.id ? colors.accent : colors.bg
                      }]}
                    >
                      <Text style={{ fontSize: 13, fontWeight: '500', color: modelProviderTab === p.id ? '#fff' : colors.muted }}>
                        {p.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>

                {/* Model list */}
                {MODEL_CATALOG.filter((m) => m.provider === modelProviderTab).map((m) => (
                  <Pressable
                    key={m.id}
                    onPress={() => {
                      setProviderModels((prev) => ({ ...prev, [modelProviderTab]: m.model }))
                      setSelectedModel(m.model)
                      setSelectedProvider(modelProviderTab)
                    }}
                    style={[styles.modelItem, {
                      borderColor: selectedModel === m.model ? colors.accent : colors.border,
                      borderWidth: selectedModel === m.model ? 2 : 1,
                      backgroundColor: colors.bg
                    }]}
                  >
                    <Text style={{ fontSize: 14, color: colors.text }}>{m.label}</Text>
                    <Text style={{ fontSize: 12, color: colors.muted }}>{m.model}</Text>
                  </Pressable>
                ))}

                <View style={styles.navRow}>
                  <Pressable onPress={() => setStep(2)}>
                    <Text style={{ color: colors.muted }}>Back</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.primaryBtn, { backgroundColor: colors.accent, opacity: step3Valid ? 1 : 0.5 }]}
                    disabled={!step3Valid}
                    onPress={handleStep3Continue}
                  >
                    <Text style={styles.primaryBtnText}>Continue</Text>
                  </Pressable>
                </View>
              </View>
            )}

            {/* Step 4: About You */}
            {step === 4 && (
              <View style={styles.column}>
                <Text style={[styles.heading, { color: colors.text }]}>A little about you</Text>
                <Text style={{ fontSize: 14, color: colors.muted, marginBottom: 16 }}>
                  Help April personalise its responses. All fields are optional.
                </Text>

                <Text style={[styles.label, { color: colors.muted }]}>What should April call you?</Text>
                <TextInput
                  value={userName}
                  onChangeText={setUserName}
                  placeholder="Your name"
                  placeholderTextColor={colors.muted}
                  style={[styles.input, { borderColor: colors.border, backgroundColor: colors.bg, color: colors.text }]}
                />

                <Text style={[styles.label, { color: colors.muted, marginTop: 12 }]}>Where are you based?</Text>
                <TextInput
                  value={userLocation}
                  onChangeText={setUserLocation}
                  placeholder="e.g. London, UK"
                  placeholderTextColor={colors.muted}
                  style={[styles.input, { borderColor: colors.border, backgroundColor: colors.bg, color: colors.text }]}
                />

                <Text style={[styles.label, { color: colors.muted, marginTop: 12 }]}>Anything else April should know?</Text>
                <TextInput
                  value={userBio}
                  onChangeText={setUserBio}
                  placeholder="e.g. I'm a software engineer..."
                  placeholderTextColor={colors.muted}
                  multiline
                  numberOfLines={3}
                  style={[styles.input, styles.textArea, { borderColor: colors.border, backgroundColor: colors.bg, color: colors.text }]}
                />

                <View style={styles.navRow}>
                  <Pressable onPress={() => setStep(3)}>
                    <Text style={{ color: colors.muted }}>Back</Text>
                  </Pressable>
                  <Pressable style={[styles.primaryBtn, { backgroundColor: colors.accent }]} onPress={handleStep4Continue}>
                    <Text style={styles.primaryBtnText}>Continue</Text>
                  </Pressable>
                </View>
              </View>
            )}

            {/* Step 5: Personality */}
            {step === 5 && (
              <View style={styles.column}>
                <Text style={[styles.heading, { color: colors.text }]}>How should April communicate?</Text>
                <Text style={{ fontSize: 14, color: colors.muted, marginBottom: 16 }}>
                  Choose a communication style. You can change this later in Settings.
                </Text>

                <View style={styles.personalityGrid}>
                  {PERSONALITIES.map(({ id, label, description }) => (
                    <Pressable
                      key={id}
                      onPress={() => setPersonality(id)}
                      style={[styles.personalityItem, {
                        borderColor: personality === id ? colors.accent : colors.border,
                        borderWidth: personality === id ? 2 : 1,
                        backgroundColor: colors.bg
                      }]}
                    >
                      <Text style={{ fontWeight: '600', fontSize: 13, color: colors.text }}>{label}</Text>
                      <Text style={{ fontSize: 11, color: colors.muted }}>{description}</Text>
                    </Pressable>
                  ))}
                </View>

                {personality === 'custom' && (
                  <TextInput
                    value={customPrompt}
                    onChangeText={setCustomPrompt}
                    placeholder="Describe how April should communicate..."
                    placeholderTextColor={colors.muted}
                    multiline
                    numberOfLines={3}
                    style={[styles.input, styles.textArea, { borderColor: colors.border, backgroundColor: colors.bg, color: colors.text, marginTop: 12 }]}
                  />
                )}

                <View style={styles.navRow}>
                  <Pressable onPress={() => setStep(4)}>
                    <Text style={{ color: colors.muted }}>Back</Text>
                  </Pressable>
                  <Pressable style={[styles.primaryBtn, { backgroundColor: colors.accent }]} onPress={handleFinish}>
                    <Text style={styles.primaryBtnText}>Finish Setup</Text>
                  </Pressable>
                </View>
              </View>
            )}

            {/* Done */}
            {step === 'done' && (
              <View style={styles.centerColumn}>
                <Check size={48} color={colors.accent} />
                <Text style={[styles.title, { color: colors.text }]}>You're all set!</Text>
                <Text style={{ fontSize: 14, color: colors.muted, textAlign: 'center' }}>
                  April is ready. {providerLabel(displayProvider)} · {displayModel}
                </Text>
              </View>
            )}
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center'
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24
  },
  card: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden'
  },
  cardContent: {
    padding: 28
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24
  },
  centerColumn: {
    alignItems: 'center',
    gap: 16
  },
  column: {
    gap: 4
  },
  title: {
    fontSize: 24,
    fontWeight: '600'
  },
  heading: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 4
  },
  label: {
    fontSize: 13,
    marginBottom: 6
  },
  input: {
    padding: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1,
    fontSize: 14
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top'
  },
  primaryBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    marginTop: 8
  },
  primaryBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center'
  },
  navRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 20
  },
  tab: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1
  },
  modelItem: {
    padding: 14,
    borderRadius: 8,
    marginBottom: 8
  },
  personalityGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10
  },
  personalityItem: {
    padding: 14,
    borderRadius: 8,
    width: '47%'
  }
})
