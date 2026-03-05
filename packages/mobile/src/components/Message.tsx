import React from 'react'
import { View, Text, Pressable, Image, StyleSheet } from 'react-native'
import { AlertCircle, RotateCcw } from 'lucide-react-native'
import { useTheme } from '../theme/ThemeProvider'
import { MessageContent } from './MessageContent'
import { ActivityLog } from './ActivityLog'
import type { Message as MessageType, ContentBlock } from '@april/core'

interface Props {
  message: MessageType
  isStreaming?: boolean
  onRetry?: () => void
}

export function Message({ message, isStreaming = false, onRetry }: Props): JSX.Element {
  const colors = useTheme()
  const isUser = message.role === 'user'
  const label = isUser ? 'You' : 'April'

  type RenderItem =
    | { kind: 'text'; text: string }
    | { kind: 'image'; block: { type: 'image'; mediaType: string; data: string } }
    | { kind: 'activity'; blocks: ContentBlock[] }

  const items: RenderItem[] = []
  const activityBlocks: ContentBlock[] = []
  let activitySlotInserted = false

  for (const block of message.blocks) {
    if (block.type === 'text') {
      items.push({ kind: 'text', text: block.text })
    } else if (block.type === 'image') {
      items.push({ kind: 'image', block: block as { type: 'image'; mediaType: string; data: string } })
    } else {
      activityBlocks.push(block)
      if (!activitySlotInserted) {
        items.push({ kind: 'activity', blocks: activityBlocks })
        activitySlotInserted = true
      }
    }
  }

  return (
    <View style={[styles.messageRow, { backgroundColor: isUser ? `${colors.surface}80` : 'transparent', borderBottomColor: colors.border }]}>
      <Text style={[styles.label, { color: colors.muted }]}>{label}</Text>

      {items.map((item, i) => {
        if (item.kind === 'text') {
          // User messages: plain text. Assistant messages: markdown via WebView.
          if (isUser) {
            return (
              <Text key={i} style={[styles.messageText, { color: colors.text }]}>
                {item.text}
              </Text>
            )
          }
          return <MessageContent key={i} text={item.text} />
        }
        if (item.kind === 'image') {
          const uri = `data:${item.block.mediaType};base64,${item.block.data}`
          return (
            <View key={i} style={styles.imageContainer}>
              <Image
                source={{ uri }}
                style={[styles.imageThumb, { borderColor: colors.border }]}
                resizeMode="cover"
              />
            </View>
          )
        }
        return (
          <ActivityLog key="activity" blocks={item.blocks} isStreaming={isStreaming} />
        )
      })}

      {/* Error state */}
      {message.error && (
        <View style={[styles.errorBox, { borderColor: 'rgba(239,68,68,0.2)', backgroundColor: 'rgba(239,68,68,0.08)' }]}>
          <AlertCircle size={13} color="#f87171" />
          <Text style={[styles.errorText, { color: '#f87171' }]}>{message.error}</Text>
          {onRetry && (
            <Pressable onPress={onRetry} style={styles.retryBtn}>
              <RotateCcw size={11} color="#f87171" />
              <Text style={{ color: '#f87171', fontSize: 12 }}>Retry</Text>
            </Pressable>
          )}
        </View>
      )}

      {/* Empty streaming state */}
      {message.blocks.length === 0 && isStreaming && (
        <View style={styles.thinkingRow}>
          <View style={[styles.pulseDot, { backgroundColor: colors.accent }]} />
          <Text style={{ color: colors.muted, fontSize: 12 }}>Thinking...</Text>
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  messageRow: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5
  },
  messageText: {
    fontSize: 15,
    lineHeight: 22
  },
  imageContainer: {
    marginVertical: 4
  },
  imageThumb: {
    width: 220,
    height: 165,
    borderRadius: 10,
    borderWidth: 1
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1
  },
  errorText: {
    flex: 1,
    fontSize: 12
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4
  },
  thinkingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4
  },
  pulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3
  }
})
