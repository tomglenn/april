import React, { useState } from 'react'
import { View, Text, Pressable, Modal, FlatList, StyleSheet } from 'react-native'
import { Check, ChevronDown, X } from 'lucide-react-native'
import { useTheme } from '../theme/ThemeProvider'
import { MODEL_CATALOG } from '../models'
import type { Provider } from '@april/core'

interface Props {
  model: string
  provider: Provider
  onSelect: (model: string, provider: Provider) => void
  filterProvider?: Provider
}

export function ModelPicker({ model, provider, onSelect, filterProvider }: Props): JSX.Element {
  const colors = useTheme()
  const [visible, setVisible] = useState(false)
  const [tab, setTab] = useState<Provider>(filterProvider ?? provider ?? 'anthropic')

  const current = MODEL_CATALOG.find((m) => m.model === model)
  const models = MODEL_CATALOG.filter((m) => filterProvider ? m.provider === filterProvider : m.provider === tab)
  const tabs: Provider[] = filterProvider ? [filterProvider] : ['anthropic', 'openai']

  return (
    <>
      <Pressable
        onPress={() => setVisible(true)}
        style={[styles.trigger, { backgroundColor: colors.bg, borderColor: colors.border }]}
      >
        <Text style={{ color: colors.text, fontSize: 14, flex: 1 }} numberOfLines={1}>
          {current?.label ?? (model || 'Select model')}
        </Text>
        <ChevronDown size={14} color={colors.muted} />
      </Pressable>

      <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
        <View style={[styles.modal, { backgroundColor: colors.bg }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <Text style={{ fontSize: 17, fontWeight: '600', color: colors.text }}>Choose Model</Text>
            <Pressable onPress={() => setVisible(false)} style={styles.closeBtn}>
              <X size={20} color={colors.muted} />
            </Pressable>
          </View>

          {/* Provider tabs */}
          {tabs.length > 1 && (
            <View style={[styles.tabRow, { borderBottomColor: colors.border }]}>
              {tabs.map((t) => (
                <Pressable
                  key={t}
                  onPress={() => setTab(t)}
                  style={[
                    styles.tab,
                    tab === t && { borderBottomColor: colors.accent, borderBottomWidth: 2 }
                  ]}
                >
                  <Text style={{ color: tab === t ? colors.accent : colors.muted, fontSize: 14, fontWeight: '500' }}>
                    {t === 'anthropic' ? 'Anthropic' : 'OpenAI'}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}

          <FlatList
            data={models}
            keyExtractor={(m) => m.id}
            contentContainerStyle={{ padding: 12 }}
            renderItem={({ item: m }) => {
              const isSelected = m.model === model && m.provider === provider
              return (
                <Pressable
                  onPress={() => {
                    onSelect(m.model, m.provider)
                    setVisible(false)
                  }}
                  style={[
                    styles.modelRow,
                    { backgroundColor: isSelected ? `${colors.accent}15` : colors.surface, borderColor: colors.border }
                  ]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.text, fontSize: 15 }}>{m.label}</Text>
                    <Text style={{ color: colors.muted, fontSize: 12, marginTop: 2 }}>{m.model}</Text>
                  </View>
                  {isSelected && <Check size={16} color={colors.accent} />}
                </Pressable>
              )
            }}
          />
        </View>
      </Modal>
    </>
  )
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    gap: 8
  },
  modal: {
    flex: 1
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1
  },
  closeBtn: {
    padding: 4
  },
  tabRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    paddingHorizontal: 16
  },
  tab: {
    paddingHorizontal: 16,
    paddingVertical: 12
  },
  modelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 8
  }
})
