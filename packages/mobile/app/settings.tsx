import React, { useState, useCallback } from 'react'
import {
  View,
  Text,
  TextInput,
  ScrollView,
  Pressable,
  StyleSheet,
  Alert
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useNavigation } from '@react-navigation/native'
import { ChevronLeft, Eye, EyeOff, Trash2 } from 'lucide-react-native'
import { useTheme } from '../src/theme/ThemeProvider'
import { useSettingsStore } from '../src/stores/settings'
import { ModelPicker } from '../src/components/ModelPicker'
import type { Provider, Memory } from '@april/core'

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

function detectPersonality(personalityPrompt: string): Personality | null {
  if (!personalityPrompt) return null
  for (const [id, text] of Object.entries(PERSONALITY_PROMPTS)) {
    if (personalityPrompt === text) return id as Personality
  }
  return 'custom'
}

function Section({ title, children }: { title: string; children: React.ReactNode }): JSX.Element {
  const colors = useTheme()
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: colors.muted }]}>{title}</Text>
      <View style={[styles.sectionBody, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        {children}
      </View>
    </View>
  )
}

function ApiKeyField({
  label,
  value,
  onChange,
  placeholder
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder: string
}): JSX.Element {
  const colors = useTheme()
  const [visible, setVisible] = useState(false)

  return (
    <View style={[styles.field, { borderBottomColor: colors.border }]}>
      <Text style={[styles.fieldLabel, { color: colors.text }]}>{label}</Text>
      <View style={styles.keyRow}>
        <TextInput
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor={colors.muted}
          secureTextEntry={!visible}
          autoCapitalize="none"
          autoCorrect={false}
          style={[styles.fieldInput, styles.keyInput, { color: colors.text }]}
        />
        <Pressable onPress={() => setVisible((v) => !v)} style={styles.eyeBtn} hitSlop={8}>
          {visible ? <EyeOff size={16} color={colors.muted} /> : <Eye size={16} color={colors.muted} />}
        </Pressable>
      </View>
    </View>
  )
}

export default function SettingsScreen(): JSX.Element {
  const colors = useTheme()
  const navigation = useNavigation()
  const { settings, update } = useSettingsStore()
  const [personality, setPersonality] = useState<Personality | null>(null)
  const [initialized, setInitialized] = useState(false)

  if (!settings) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
        <Text style={{ color: colors.muted, textAlign: 'center', marginTop: 40 }}>Loading...</Text>
      </SafeAreaView>
    )
  }

  if (!initialized) {
    setPersonality(detectPersonality(settings.personalityPrompt ?? ''))
    setInitialized(true)
  }

  const handleUpdate = (partial: Record<string, unknown>): void => {
    update(partial as any)
  }

  const selectPersonality = (id: Personality): void => {
    setPersonality(id)
    if (id !== 'custom') {
      handleUpdate({ personalityPrompt: PERSONALITY_PROMPTS[id] })
    } else {
      const saved = settings.customPersonalityPrompt ?? ''
      handleUpdate({ personalityPrompt: saved })
    }
  }

  const deleteMemory = (id: string): void => {
    handleUpdate({ memories: (settings.memories ?? []).filter((m) => m.id !== id) })
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
          <ChevronLeft size={22} color={colors.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Settings</Text>
        <View style={{ width: 34 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Providers */}
        <Section title="API Keys">
          <ApiKeyField
            label="Anthropic"
            value={settings.anthropicApiKey}
            onChange={(v) => handleUpdate({ anthropicApiKey: v })}
            placeholder="sk-ant-..."
          />
          <ApiKeyField
            label="OpenAI"
            value={settings.openaiApiKey}
            onChange={(v) => handleUpdate({ openaiApiKey: v })}
            placeholder="sk-..."
          />
        </Section>

        {/* Default Model */}
        <Section title="Default Model">
          <View style={{ padding: 14 }}>
            <ModelPicker
              model={settings.defaultModel}
              provider={settings.defaultProvider}
              onSelect={(model, provider) => handleUpdate({ defaultModel: model, defaultProvider: provider })}
            />
          </View>
        </Section>

        {/* Appearance */}
        <Section title="Appearance">
          <View style={[styles.field, { borderBottomColor: colors.border }]}>
            <Text style={[styles.fieldLabel, { color: colors.text }]}>Theme</Text>
            <View style={styles.themeRow}>
              {(['dark', 'light', 'system'] as const).map((t) => (
                <Pressable
                  key={t}
                  onPress={() => handleUpdate({ theme: t })}
                  style={[
                    styles.themeBtn,
                    {
                      backgroundColor: settings.theme === t ? colors.accent : colors.bg,
                      borderColor: settings.theme === t ? colors.accent : colors.border
                    }
                  ]}
                >
                  <Text style={{ color: settings.theme === t ? '#fff' : colors.text, fontSize: 13 }}>
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        </Section>

        {/* About You */}
        <Section title="About You">
          <View style={[styles.field, { borderBottomColor: colors.border }]}>
            <Text style={[styles.fieldLabel, { color: colors.text }]}>Name</Text>
            <TextInput
              value={settings.userName}
              onChangeText={(v) => handleUpdate({ userName: v })}
              placeholder="Your name"
              placeholderTextColor={colors.muted}
              style={[styles.fieldInput, { color: colors.text }]}
            />
          </View>
          <View style={[styles.field, { borderBottomColor: colors.border }]}>
            <Text style={[styles.fieldLabel, { color: colors.text }]}>Location</Text>
            <TextInput
              value={settings.userLocation}
              onChangeText={(v) => handleUpdate({ userLocation: v })}
              placeholder="City, Country"
              placeholderTextColor={colors.muted}
              style={[styles.fieldInput, { color: colors.text }]}
            />
          </View>
          <View style={styles.field}>
            <Text style={[styles.fieldLabel, { color: colors.text }]}>Bio</Text>
            <TextInput
              value={settings.userBio}
              onChangeText={(v) => handleUpdate({ userBio: v })}
              placeholder="Tell April about yourself"
              placeholderTextColor={colors.muted}
              multiline
              style={[styles.fieldInput, { color: colors.text, minHeight: 60 }]}
            />
          </View>
        </Section>

        {/* Personality */}
        <Section title="Personality">
          <View style={{ padding: 14 }}>
            <View style={styles.personalityGrid}>
              {PERSONALITIES.map(({ id, label, description }) => {
                const active = personality === id
                return (
                  <Pressable
                    key={id}
                    onPress={() => selectPersonality(id)}
                    style={[
                      styles.personalityBtn,
                      {
                        backgroundColor: colors.bg,
                        borderColor: active ? colors.accent : colors.border,
                        borderWidth: active ? 2 : 1
                      }
                    ]}
                  >
                    <Text style={[styles.personalityLabel, { color: colors.text }]}>{label}</Text>
                    <Text style={[styles.personalityDesc, { color: colors.muted }]}>{description}</Text>
                  </Pressable>
                )
              })}
            </View>
            {personality === 'custom' && (
              <TextInput
                value={settings.customPersonalityPrompt ?? ''}
                onChangeText={(v) => handleUpdate({ personalityPrompt: v, customPersonalityPrompt: v })}
                placeholder="Describe how April should communicate…"
                placeholderTextColor={colors.muted}
                multiline
                style={[
                  styles.fieldInput,
                  styles.customPromptInput,
                  { color: colors.text, borderColor: colors.border, backgroundColor: colors.bg }
                ]}
              />
            )}
          </View>
        </Section>

        {/* Memories */}
        <Section title="Memories">
          <View style={{ padding: 14 }}>
            {(settings.memories ?? []).length === 0 ? (
              <Text style={{ color: colors.muted, fontSize: 13, textAlign: 'center' }}>
                No memories yet. April will save things here automatically.
              </Text>
            ) : (
              (settings.memories ?? []).map((m) => (
                <View key={m.id} style={[styles.memoryItem, { borderBottomColor: colors.border }]}>
                  <Text style={{ color: colors.text, fontSize: 13, flex: 1 }}>{m.content}</Text>
                  <Pressable onPress={() => deleteMemory(m.id)} hitSlop={8}>
                    <Trash2 size={13} color={colors.muted} />
                  </Pressable>
                </View>
              ))
            )}
          </View>
        </Section>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 48,
    paddingHorizontal: 8,
    borderBottomWidth: 1
  },
  backBtn: {
    padding: 6
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600'
  },
  content: {
    padding: 16
  },
  section: {
    marginBottom: 24
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
    marginLeft: 4
  },
  sectionBody: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden'
  },
  field: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 6
  },
  fieldInput: {
    fontSize: 14,
    padding: 0
  },
  keyRow: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  keyInput: {
    flex: 1
  },
  eyeBtn: {
    padding: 6,
    marginLeft: 4
  },
  themeRow: {
    flexDirection: 'row',
    gap: 8
  },
  themeBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1
  },
  personalityGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  personalityBtn: {
    width: '47%',
    padding: 12,
    borderRadius: 10
  },
  personalityLabel: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 2
  },
  personalityDesc: {
    fontSize: 11
  },
  customPromptInput: {
    marginTop: 12,
    padding: 10,
    borderWidth: 1,
    borderRadius: 8,
    minHeight: 80,
    textAlignVertical: 'top'
  },
  memoryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth
  }
})
