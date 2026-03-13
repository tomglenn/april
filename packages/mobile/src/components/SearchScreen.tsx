import React, { useState, useMemo } from 'react'
import { View, Text, TextInput, FlatList, Pressable, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Search, X, MessageSquare } from 'lucide-react-native'
import Fuse from 'fuse.js'
import { useTheme } from '../theme/ThemeProvider'
import { useConversationsStore } from '../stores/conversations'
import type { Conversation } from '@april/core'

interface Props {
  onSelect: (conversationId: string) => void
  onClose: () => void
}

interface SearchResult {
  conversation: Conversation
  snippet: string
}

export function SearchScreen({ onSelect, onClose }: Props): JSX.Element {
  const colors = useTheme()
  const { conversations } = useConversationsStore()
  const [query, setQuery] = useState('')

  // Build searchable items: conversation title + all message text
  const searchItems = useMemo(() => {
    return conversations.map((c) => {
      const allText = c.messages
        .flatMap((m) => m.blocks.filter((b) => b.type === 'text').map((b) => (b as { type: 'text'; text: string }).text))
        .join(' ')
      return { id: c.id, title: c.title, text: allText, conversation: c }
    })
  }, [conversations])

  const fuse = useMemo(
    () => new Fuse(searchItems, { keys: ['title', 'text'], threshold: 0.4, includeMatches: true }),
    [searchItems]
  )

  const results: SearchResult[] = useMemo(() => {
    if (!query.trim()) return []
    return fuse.search(query).slice(0, 20).map((r) => {
      const conv = r.item.conversation
      // Find the matching text snippet
      const textMatch = r.matches?.find((m) => m.key === 'text')
      let snippet = ''
      if (textMatch?.value) {
        const idx = textMatch.value.toLowerCase().indexOf(query.toLowerCase())
        if (idx >= 0) {
          const start = Math.max(0, idx - 30)
          const end = Math.min(textMatch.value.length, idx + query.length + 50)
          snippet = (start > 0 ? '...' : '') + textMatch.value.slice(start, end) + (end < textMatch.value.length ? '...' : '')
        } else {
          snippet = textMatch.value.slice(0, 80) + '...'
        }
      } else {
        const firstMsg = conv.messages[0]
        if (firstMsg) {
          const text = firstMsg.blocks
            .filter((b) => b.type === 'text')
            .map((b) => (b as { type: 'text'; text: string }).text)
            .join(' ')
          snippet = text.slice(0, 80)
        }
      }
      return { conversation: conv, snippet }
    })
  }, [query, fuse])

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <View style={[styles.searchBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Search size={14} color={colors.muted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search conversations..."
            placeholderTextColor={colors.muted}
            autoFocus
            style={[styles.searchInput, { color: colors.text }]}
          />
          {query.length > 0 && (
            <Pressable onPress={() => setQuery('')}>
              <X size={14} color={colors.muted} />
            </Pressable>
          )}
        </View>
        <Pressable onPress={onClose} style={styles.cancelBtn}>
          <Text style={{ color: colors.accent, fontSize: 14 }}>Cancel</Text>
        </Pressable>
      </View>

      <FlatList
        data={results}
        keyExtractor={(r) => r.conversation.id}
        contentContainerStyle={{ paddingVertical: 4 }}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => onSelect(item.conversation.id)}
            style={[styles.resultItem, { borderBottomColor: colors.border }]}
          >
            <MessageSquare size={14} color={colors.muted} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontSize: 14, fontWeight: '500' }} numberOfLines={1}>
                {item.conversation.title}
              </Text>
              {item.snippet ? (
                <Text style={{ color: colors.muted, fontSize: 12, marginTop: 2 }} numberOfLines={2}>
                  {item.snippet}
                </Text>
              ) : null}
            </View>
          </Pressable>
        )}
        ListEmptyComponent={
          query.trim() ? (
            <Text style={{ color: colors.muted, textAlign: 'center', marginTop: 40, fontSize: 13 }}>
              No results
            </Text>
          ) : (
            <Text style={{ color: colors.muted, textAlign: 'center', marginTop: 40, fontSize: 13 }}>
              Search by conversation title or message content
            </Text>
          )
        }
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
    borderBottomWidth: 1
  },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    padding: 0
  },
  cancelBtn: {
    paddingHorizontal: 4
  },
  resultItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth
  }
})
