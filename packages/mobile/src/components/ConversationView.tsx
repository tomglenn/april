import React, { useEffect, useRef, useMemo, useCallback } from 'react'
import {
  View,
  Text,
  FlatList,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform
} from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { useNavigation, DrawerActions } from '@react-navigation/native'
import { Menu } from 'lucide-react-native'
import * as Haptics from 'expo-haptics'
import { useConversationsStore } from '../stores/conversations'
import { useSettingsStore } from '../stores/settings'
import { useTheme } from '../theme/ThemeProvider'
import { useChat } from '../hooks/useChat'
import { Message } from './Message'
import { InputBar } from './InputBar'
import { MODEL_CATALOG } from '../models'
import type { ImageAttachment } from '@april/core'

const SUGGESTIONS = [
  'Explain how transformers work in AI',
  'Help me write a professional email',
  'Write a Python script to rename files',
  "What's the best way to structure a React project?",
  'Help me plan a healthy weekly meal plan',
  'Explain Docker and when I should use it',
  'Give me 5 name ideas for a productivity app',
  'How do I negotiate a higher salary?'
]

export function ConversationView(): JSX.Element {
  const { activeId, conversations } = useConversationsStore()
  const { settings } = useSettingsStore()
  const colors = useTheme()
  const navigation = useNavigation()
  const insets = useSafeAreaInsets()
  const { streamingState, sendMessage, stopStreaming, retryMessage } = useChat(activeId)
  const activeStream = activeId ? streamingState[activeId] : undefined
  const isActiveStreaming = !!activeStream
  const flatListRef = useRef<FlatList>(null)

  const activeConv = conversations.find((c) => c.id === activeId)
  const effectiveModel = activeConv?.model ?? settings?.defaultModel ?? ''
  const effectiveProvider = activeConv?.provider ?? settings?.defaultProvider ?? 'anthropic'

  const missingKey =
    settings !== null &&
    ((effectiveProvider === 'anthropic' && !settings.anthropicApiKey) ||
      (effectiveProvider === 'openai' && !settings.openaiApiKey))

  const suggestions = useMemo(() => {
    const shuffled = [...SUGGESTIONS].sort(() => Math.random() - 0.5)
    return shuffled.slice(0, 4)
  }, [activeId])

  // Auto-scroll on new messages
  useEffect(() => {
    if (activeConv?.messages.length) {
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100)
    }
  }, [activeConv?.messages.length, activeStream])

  const handleSend = useCallback((text: string, images?: ImageAttachment[]) => {
    if (!effectiveModel || missingKey) return
    sendMessage(text, effectiveModel, effectiveProvider, images)
  }, [effectiveModel, effectiveProvider, missingKey, sendMessage])

  const handleSuggestion = useCallback((s: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    handleSend(s)
  }, [handleSend])

  const openDrawer = useCallback(() => {
    navigation.dispatch(DrawerActions.openDrawer())
  }, [navigation])

  if (!activeId || !activeConv) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]}>
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <Pressable onPress={openDrawer} style={styles.menuButton}>
            <Menu size={22} color={colors.muted} />
          </Pressable>
        </View>
        <View style={styles.emptyState}>
          <Text style={{ fontSize: 16, color: colors.muted }}>No conversation selected</Text>
          <Text style={{ fontSize: 13, color: colors.muted, opacity: 0.6, marginTop: 4 }}>
            Open the drawer to start a new chat
          </Text>
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={openDrawer} style={styles.menuButton}>
          <Menu size={22} color={colors.muted} />
        </Pressable>
        <Text style={{ fontSize: 13, color: colors.muted, flex: 1 }} numberOfLines={1}>
          {MODEL_CATALOG.find((m) => m.model === effectiveModel)?.label ?? effectiveModel}
        </Text>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        {activeConv.messages.length === 0 ? (
          <View style={styles.suggestionsContainer}>
            <Text style={{ fontSize: 16, fontWeight: '500', color: colors.text, marginBottom: 4 }}>
              What can I help with?
            </Text>
            <Text style={{ fontSize: 13, color: colors.muted, marginBottom: 20 }}>
              A few ideas to get you started
            </Text>
            <View style={styles.suggestionsGrid}>
              {suggestions.map((s) => (
                <Pressable
                  key={s}
                  onPress={() => handleSuggestion(s)}
                  style={[styles.suggestionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
                >
                  <Text style={{ fontSize: 13, color: colors.muted, lineHeight: 18 }}>{s}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={activeConv.messages}
            keyExtractor={(msg) => msg.id}
            renderItem={({ item: msg, index }) => {
              const message = activeStream && msg.id === activeStream.msgId
                ? { ...msg, blocks: activeStream.blocks }
                : msg
              return (
                <Message
                  message={message}
                  isStreaming={isActiveStreaming && index === activeConv.messages.length - 1}
                  isLast={index === activeConv.messages.length - 1}
                  onRetry={msg.role === 'user' && msg.error ? () => retryMessage(msg) : undefined}
                />
              )
            }}
            contentContainerStyle={{ paddingBottom: 8 }}
            onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
          />
        )}

        <InputBar
          onSend={handleSend}
          onStop={stopStreaming}
          isStreaming={isActiveStreaming}
          model={effectiveModel}
          provider={effectiveProvider}
          missingKey={!!missingKey}
        />
        <View style={{ height: insets.bottom, backgroundColor: colors.surface }} />
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1
  },
  header: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    gap: 8
  },
  menuButton: {
    padding: 6
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center'
  },
  suggestionsContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24
  },
  suggestionsGrid: {
    width: '100%',
    gap: 8
  },
  suggestionCard: {
    padding: 14,
    borderRadius: 10,
    borderWidth: 1
  }
})
