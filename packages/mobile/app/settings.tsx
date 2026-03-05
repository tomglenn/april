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
          style={[styles.fieldInput, { color: colors.text }]}
        />
        <Pressable onPress={() => setVisible((v) => !v)} style={styles.eyeBtn}>
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

  if (!settings) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
        <Text style={{ color: colors.muted, textAlign: 'center', marginTop: 40 }}>Loading...</Text>
      </SafeAreaView>
    )
  }

  const handleUpdate = (partial: Record<string, unknown>): void => {
    update(partial as any)
  }

  const addMemory = (): void => {
    Alert.prompt('New Memory', 'What should April remember?', (text) => {
      if (!text?.trim()) return
      const memory: Memory = {
        id: Date.now().toString(),
        content: text.trim(),
        createdAt: Date.now()
      }
      handleUpdate({ memories: [...(settings.memories ?? []), memory] })
    })
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

        {/* Personalisation */}
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
          <View style={styles.field}>
            <Text style={[styles.fieldLabel, { color: colors.text }]}>Custom Instructions</Text>
            <TextInput
              value={settings.customPersonalityPrompt}
              onChangeText={(v) => handleUpdate({ customPersonalityPrompt: v })}
              placeholder="Additional personality instructions for April..."
              placeholderTextColor={colors.muted}
              multiline
              style={[styles.fieldInput, { color: colors.text, minHeight: 80 }]}
            />
          </View>
        </Section>

        {/* Memories */}
        <Section title="Memories">
          <View style={{ padding: 14 }}>
            {(settings.memories ?? []).length === 0 ? (
              <Text style={{ color: colors.muted, fontSize: 13, textAlign: 'center', marginBottom: 12 }}>
                No memories yet
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
            <Pressable
              onPress={addMemory}
              style={[styles.addBtn, { borderColor: colors.border }]}
            >
              <Text style={{ color: colors.accent, fontSize: 13, fontWeight: '500' }}>+ Add Memory</Text>
            </Pressable>
          </View>
        </Section>

        {/* Voice */}
        <Section title="Voice">
          <View style={[styles.field, { borderBottomColor: colors.border }]}>
            <Text style={[styles.fieldLabel, { color: colors.text }]}>Auto-play responses</Text>
            <Pressable
              onPress={() => handleUpdate({ voiceAutoPlay: !settings.voiceAutoPlay })}
              style={[
                styles.toggle,
                { backgroundColor: settings.voiceAutoPlay ? colors.accent : colors.bg }
              ]}
            >
              <View style={[
                styles.toggleKnob,
                { transform: [{ translateX: settings.voiceAutoPlay ? 18 : 2 }] }
              ]} />
            </Pressable>
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
  eyeBtn: {
    padding: 6
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
  memoryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth
  },
  addBtn: {
    alignItems: 'center',
    paddingVertical: 10,
    marginTop: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: 'dashed'
  },
  toggle: {
    width: 40,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center'
  },
  toggleKnob: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#fff'
  }
})
