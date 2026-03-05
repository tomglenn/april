import React, { useState, useMemo } from 'react'
import { View, Text, FlatList, Pressable, TextInput, Alert, StyleSheet } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { SquarePen, MessageSquare, Search, Settings, Trash2, X } from 'lucide-react-native'
import { useConversationsStore } from '../stores/conversations'
import { useTheme } from '../theme/ThemeProvider'
import type { DrawerContentComponentProps } from '@react-navigation/drawer'
import type { Conversation } from '@april/core'

export function DrawerContent({ navigation }: DrawerContentComponentProps): JSX.Element {
  const colors = useTheme()
  const insets = useSafeAreaInsets()
  const { conversations, activeId, setActiveId, createNew, deleteConv, renameConv } =
    useConversationsStore()
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    if (!query.trim()) return conversations
    const q = query.toLowerCase()
    return conversations.filter((c) => c.title.toLowerCase().includes(q))
  }, [conversations, query])

  const handleSelect = (id: string): void => {
    setActiveId(id)
    navigation.closeDrawer()
  }

  const handleNew = async (): Promise<void> => {
    await createNew()
    navigation.closeDrawer()
  }

  const handleDelete = (conv: Conversation): void => {
    Alert.alert(
      'Delete conversation?',
      `"${conv.title}" will be permanently deleted.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => deleteConv(conv.id)
        }
      ]
    )
  }

  const handleRename = (conv: Conversation): void => {
    Alert.prompt(
      'Rename conversation',
      undefined,
      (newTitle) => {
        if (newTitle?.trim()) renameConv(conv.id, newTitle.trim())
      },
      'plain-text',
      conv.title
    )
  }

  const snippet = (conv: Conversation): string => {
    const firstMsg = conv.messages.find((m) => m.role === 'user')
    if (!firstMsg) return ''
    const text = firstMsg.blocks
      .filter((b) => b.type === 'text')
      .map((b) => (b as { type: 'text'; text: string }).text)
      .join(' ')
    return text.slice(0, 60) + (text.length > 60 ? '...' : '')
  }

  const renderItem = ({ item: conv }: { item: Conversation }): JSX.Element => {
    const isActive = conv.id === activeId
    return (
      <Pressable
        onPress={() => handleSelect(conv.id)}
        onLongPress={() => handleRename(conv)}
        style={[
          styles.convItem,
          { backgroundColor: isActive ? `${colors.accent}15` : 'transparent' }
        ]}
      >
        <MessageSquare size={13} color={isActive ? colors.text : colors.muted} />
        <View style={styles.convText}>
          <Text
            style={{ fontSize: 13, color: isActive ? colors.text : colors.muted }}
            numberOfLines={1}
          >
            {conv.title}
          </Text>
          {conv.messages.length > 0 && (
            <Text style={{ fontSize: 11, color: colors.muted, opacity: 0.6 }} numberOfLines={1}>
              {snippet(conv)}
            </Text>
          )}
        </View>
        <Pressable
          onPress={() => handleDelete(conv)}
          hitSlop={8}
          style={styles.deleteBtn}
        >
          <Trash2 size={12} color={colors.muted} />
        </Pressable>
      </Pressable>
    )
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.surface, paddingTop: insets.top }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Text style={[styles.headerTitle, { color: colors.text }]}>April</Text>
        <Pressable onPress={handleNew} style={styles.newBtn}>
          <SquarePen size={18} color={colors.muted} />
        </Pressable>
      </View>

      {/* Search */}
      <View style={styles.searchWrap}>
        <View style={[styles.searchBox, { backgroundColor: colors.bg, borderColor: colors.border }]}>
          <Search size={12} color={colors.muted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Filter..."
            placeholderTextColor={colors.muted}
            style={[styles.searchInput, { color: colors.text }]}
          />
          {query.length > 0 && (
            <Pressable onPress={() => setQuery('')}>
              <X size={12} color={colors.muted} />
            </Pressable>
          )}
        </View>
      </View>

      {/* Conversation list */}
      <FlatList
        data={filtered}
        keyExtractor={(c) => c.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <Text style={{ color: colors.muted, textAlign: 'center', marginTop: 20, fontSize: 12 }}>
            {query ? 'No matches' : 'No conversations yet'}
          </Text>
        }
      />

      {/* Footer */}
      <Pressable
        onPress={() => {
          navigation.closeDrawer()
          router.push('/settings')
        }}
        style={[styles.footer, { borderTopColor: colors.border, paddingBottom: insets.bottom + 14 }]}
      >
        <Settings size={14} color={colors.muted} />
        <Text style={{ color: colors.muted, fontSize: 13 }}>Settings</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    height: 48,
    borderBottomWidth: 1
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700'
  },
  newBtn: {
    padding: 6
  },
  searchWrap: {
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    padding: 0
  },
  listContent: {
    paddingVertical: 4
  },
  convItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginHorizontal: 4,
    borderRadius: 8
  },
  convText: {
    flex: 1,
    gap: 1
  },
  deleteBtn: {
    padding: 4
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderTopWidth: 1
  }
})
