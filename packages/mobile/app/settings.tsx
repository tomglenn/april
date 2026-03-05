import React, { useState, useRef, useEffect } from 'react'
import {
  View,
  Text,
  TextInput,
  ScrollView,
  Pressable,
  StyleSheet,
  Alert,
  Keyboard,
  Dimensions
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useNavigation } from '@react-navigation/native'
import { ChevronLeft, Eye, EyeOff, Trash2, FolderOpen } from 'lucide-react-native'
import { useTheme } from '../src/theme/ThemeProvider'
import { useSettingsStore } from '../src/stores/settings'
import { useConversationsStore } from '../src/stores/conversations'
import { ModelPicker } from '../src/components/ModelPicker'
import { pickFolder } from '../src/platform/folderPicker'
import { hasAprilData } from '../src/platform/storage'
import type { Memory } from '@april/core'

function folderDisplayName(uri: string | undefined): string {
  if (!uri) return 'App storage'
  try {
    const decoded = decodeURIComponent(uri)
    const parts = decoded.replace(/\/$/, '').split('/')
    return parts[parts.length - 1] || uri
  } catch {
    return uri
  }
}

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

function SectionTitle({ label }: { label: string }): JSX.Element {
  const colors = useTheme()
  return <Text style={[styles.sectionTitle, { color: colors.muted }]}>{label}</Text>
}

function FieldLabel({ label }: { label: string }): JSX.Element {
  const colors = useTheme()
  return <Text style={[styles.fieldLabel, { color: colors.muted }]}>{label}</Text>
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
    <View style={styles.fieldGroup}>
      <FieldLabel label={label} />
      <View style={[styles.inputBox, styles.keyRow, { borderColor: colors.border, backgroundColor: colors.bg }]}>
        <TextInput
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor={colors.muted}
          secureTextEntry={!visible}
          autoCapitalize="none"
          autoCorrect={false}
          style={[styles.input, { color: colors.text, flex: 1 }]}
        />
        <Pressable onPress={() => setVisible((v) => !v)} hitSlop={8} style={{ paddingHorizontal: 8 }}>
          {visible ? <EyeOff size={16} color={colors.muted} /> : <Eye size={16} color={colors.muted} />}
        </Pressable>
      </View>
    </View>
  )
}

export default function SettingsScreen(): JSX.Element {
  const colors = useTheme()
  const navigation = useNavigation()
  const { settings, update, setDataFolderWithBookmark } = useSettingsStore()
  const loadConversations = useConversationsStore((s) => s.load)
  const [personality, setPersonality] = useState<Personality | null>(() =>
    settings ? detectPersonality(settings.personalityPrompt ?? '') : null
  )
  const scrollRef = useRef<ScrollView>(null)
  const customInputWrapRef = useRef<View>(null)
  const scrollY = useRef(0)

  useEffect(() => {
    if (settings) {
      setPersonality(detectPersonality(settings.personalityPrompt ?? ''))
    }
  }, [settings?.personalityPrompt])

  if (!settings) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface }}>
        <Text style={{ color: colors.muted, textAlign: 'center', marginTop: 40 }}>Loading...</Text>
      </SafeAreaView>
    )
  }

  const handleUpdate = (partial: Record<string, unknown>): void => {
    update(partial as any)
  }

  const selectPersonality = (id: Personality): void => {
    setPersonality(id)
    if (id !== 'custom') {
      handleUpdate({ personalityPrompt: PERSONALITY_PROMPTS[id] })
    } else {
      handleUpdate({ personalityPrompt: settings.customPersonalityPrompt ?? '' })
    }
  }

  const deleteMemory = (id: string): void => {
    handleUpdate({ memories: (settings.memories ?? []).filter((m) => m.id !== id) })
  }

  const handleChangeDataFolder = async (): Promise<void> => {
    try {
    const result = await pickFolder()
    if (!result) return
    const hasData = await hasAprilData(result.uri)
    const apply = (): void => {
      setDataFolderWithBookmark(result.uri, result.bookmark)
        .then(() => loadConversations())
        .catch((err) => Alert.alert('Error loading data', String(err?.message ?? err)))
    }

    if (hasData) {
      Alert.alert(
        'Existing April data found',
        'This folder has existing April data. Loading it will replace your current conversations and settings.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Load data', style: 'destructive', onPress: apply }
        ]
      )
    } else {
      apply()
    }
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? String(err))
    }
  }

  const handleCustomPromptFocus = (): void => {
    setTimeout(() => {
      customInputWrapRef.current?.measureInWindow((_x, y, _w, h) => {
        const keyboardHeight = Keyboard.metrics()?.height ?? 336
        const screenHeight = Dimensions.get('window').height
        const visibleBottom = screenHeight - keyboardHeight
        const inputBottom = y + h
        if (inputBottom > visibleBottom) {
          scrollRef.current?.scrollTo({
            y: scrollY.current + (inputBottom - visibleBottom) + 16,
            animated: true
          })
        }
      })
    }, 350)
  }

  const inputBox = [styles.inputBox, { borderColor: colors.border, backgroundColor: colors.bg }]

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface }}>
      <View style={[styles.header, { borderBottomColor: colors.border, backgroundColor: colors.surface }]}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
          <ChevronLeft size={22} color={colors.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Settings</Text>
        <View style={{ width: 34 }} />
      </View>

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        onScroll={(e) => { scrollY.current = e.nativeEvent.contentOffset.y }}
        scrollEventThrottle={16}>

        {/* API Keys */}
        <SectionTitle label="API Keys" />
        <View style={styles.section}>
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
        </View>

        {/* Default Model */}
        <SectionTitle label="Default Model" />
        <View style={styles.section}>
          <ModelPicker
            model={settings.defaultModel}
            provider={settings.defaultProvider}
            onSelect={(model, provider) => handleUpdate({ defaultModel: model, defaultProvider: provider })}
          />
        </View>

        {/* Appearance */}
        <SectionTitle label="Appearance" />
        <View style={styles.section}>
          <FieldLabel label="Theme" />
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

        {/* About You */}
        <SectionTitle label="About You" />
        <View style={styles.section}>
          <View style={styles.fieldGroup}>
            <FieldLabel label="Name" />
            <TextInput
              value={settings.userName}
              onChangeText={(v) => handleUpdate({ userName: v })}
              placeholder="Your name"
              placeholderTextColor={colors.muted}
              style={[styles.input, inputBox, { color: colors.text }]}
            />
          </View>
          <View style={styles.fieldGroup}>
            <FieldLabel label="Location" />
            <TextInput
              value={settings.userLocation}
              onChangeText={(v) => handleUpdate({ userLocation: v })}
              placeholder="City, Country"
              placeholderTextColor={colors.muted}
              style={[styles.input, inputBox, { color: colors.text }]}
            />
          </View>
          <View style={styles.fieldGroup}>
            <FieldLabel label="Bio" />
            <TextInput
              value={settings.userBio}
              onChangeText={(v) => handleUpdate({ userBio: v })}
              placeholder="Tell April about yourself"
              placeholderTextColor={colors.muted}
              multiline
              style={[styles.input, inputBox, { color: colors.text, minHeight: 80, textAlignVertical: 'top' }]}
            />
          </View>
        </View>

        {/* Personality */}
        <SectionTitle label="Personality" />
        <View style={styles.section}>
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
            <View ref={customInputWrapRef} style={{ marginTop: 8 }}>
              <TextInput
                value={settings.customPersonalityPrompt ?? ''}
                onChangeText={(v) => handleUpdate({ personalityPrompt: v, customPersonalityPrompt: v })}
                onFocus={handleCustomPromptFocus}
                placeholder="Describe how April should communicate…"
                placeholderTextColor={colors.muted}
                multiline
                scrollEnabled
                style={[styles.input, inputBox, { color: colors.text, height: 110, textAlignVertical: 'top' }]}
              />
            </View>
          )}
        </View>

        {/* Data */}
        <SectionTitle label="Data" />
        <View style={styles.section}>
          <FieldLabel label="Data Folder" />
          <View style={[styles.folderRow, { borderColor: colors.border, backgroundColor: colors.bg }]}>
            <FolderOpen size={16} color={colors.muted} style={{ flexShrink: 0 }} />
            <Text style={{ fontSize: 13, color: colors.text, flex: 1 }} numberOfLines={1}>
              {folderDisplayName(settings.dataFolder)}
            </Text>
            <Pressable onPress={handleChangeDataFolder} style={[styles.changeBtn, { borderColor: colors.border }]}>
              <Text style={{ fontSize: 13, color: colors.text }}>Change…</Text>
            </Pressable>
          </View>
        </View>

        {/* Memories */}
        <SectionTitle label="Memories" />
        <View style={styles.section}>
          {(settings.memories ?? []).length === 0 ? (
            <Text style={{ color: colors.muted, fontSize: 13, textAlign: 'center', paddingVertical: 8 }}>
              No memories yet. April will save things here automatically.
            </Text>
          ) : (
            (settings.memories ?? []).map((m) => (
              <View key={m.id} style={[styles.memoryItem, { borderColor: colors.border, backgroundColor: colors.bg }]}>
                <Text style={{ color: colors.text, fontSize: 13, flex: 1 }}>{m.content}</Text>
                <Pressable onPress={() => deleteMemory(m.id)} hitSlop={8}>
                  <Trash2 size={13} color={colors.muted} />
                </Pressable>
              </View>
            ))
          )}
        </View>

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
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
    marginLeft: 2
  },
  section: {
    marginBottom: 24
  },
  fieldGroup: {
    marginBottom: 10
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '500',
    marginBottom: 6,
    marginLeft: 2
  },
  input: {
    fontSize: 14,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  inputBox: {
    borderWidth: 1,
    borderRadius: 8
  },
  keyRow: {
    flexDirection: 'row',
    alignItems: 'center'
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
  memoryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderWidth: 1,
    borderRadius: 8,
    marginBottom: 8
  },
  folderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1
  },
  changeBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    flexShrink: 0
  }
})
