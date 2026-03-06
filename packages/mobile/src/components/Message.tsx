import React, { useState, useCallback, useRef } from 'react'
import {
  View,
  Text,
  Pressable,
  Image,
  Animated,
  PanResponder,
  StyleSheet,
  Modal,
  useWindowDimensions,
  Alert,
  ActionSheetIOS,
  Platform
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { AlertCircle, RotateCcw, Download, X } from 'lucide-react-native'
import * as MediaLibrary from 'expo-media-library'
import * as FileSystem from 'expo-file-system/legacy'
import * as Clipboard from 'expo-clipboard'
import * as Haptics from 'expo-haptics'
import { useTheme } from '../theme/ThemeProvider'
import { MessageContent } from './MessageContent'
import { ActivityLog } from './ActivityLog'
import type { Message as MessageType, ContentBlock } from '@april/core'

// ─── ImageBlock ──────────────────────────────────────────────────────────────

interface ImageBlockProps {
  uri: string
  data: string
  mediaType: string
}

function ImageBlock({ uri, data, mediaType }: ImageBlockProps): JSX.Element {
  const colors = useTheme()
  const { width: screenWidth } = useWindowDimensions()
  const insets = useSafeAreaInsets()
  const [aspectRatio, setAspectRatio] = useState(4 / 3)
  const [previewVisible, setPreviewVisible] = useState(false)
  const translateY = useRef(new Animated.Value(0)).current

  const imageWidth = Math.min(240, screenWidth - 80)
  const ext = mediaType === 'image/png' ? '.png' : mediaType === 'image/webp' ? '.webp' : '.jpg'

  const closePreview = useCallback(() => {
    setPreviewVisible(false)
    translateY.setValue(0)
  }, [translateY])

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gs) => gs.dy > 8 && Math.abs(gs.dy) > Math.abs(gs.dx),
      onPanResponderMove: (_, gs) => {
        if (gs.dy > 0) translateY.setValue(gs.dy)
      },
      onPanResponderRelease: (_, gs) => {
        if (gs.dy > 80 || gs.vy > 0.8) {
          setPreviewVisible(false)
          translateY.setValue(0)
        } else {
          Animated.spring(translateY, { toValue: 0, useNativeDriver: true, bounciness: 4 }).start()
        }
      }
    })
  ).current

  const saveImage = useCallback(async () => {
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync()
      if (status !== 'granted') {
        Alert.alert('Permission required', 'Allow photo library access to save images.')
        return
      }
      const filename = `april_${Date.now()}${ext}`
      const fileUri = (FileSystem.cacheDirectory ?? '') + filename
      await FileSystem.writeAsStringAsync(fileUri, data, { encoding: FileSystem.EncodingType.Base64 })
      await MediaLibrary.saveToLibraryAsync(fileUri)
      await FileSystem.deleteAsync(fileUri, { idempotent: true })
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    } catch (e) {
      Alert.alert('Error', `Failed to save image: ${e instanceof Error ? e.message : String(e)}`)
    }
  }, [data, ext])

  return (
    <>
      <Pressable
        onPress={() => setPreviewVisible(true)}
        onLongPress={saveImage}
        delayLongPress={500}
        style={{ marginVertical: 4 }}
      >
        <Image
          source={{ uri }}
          style={{
            width: imageWidth,
            height: imageWidth / aspectRatio,
            borderRadius: 10,
            borderWidth: 1,
            borderColor: colors.border
          }}
          resizeMode="cover"
          onLoad={(e) => {
            const { width, height } = e.nativeEvent.source
            if (width && height) setAspectRatio(width / height)
          }}
        />
      </Pressable>

      <Modal visible={previewVisible} transparent animationType="fade" statusBarTranslucent onRequestClose={closePreview}>
        <View style={styles.previewOverlay}>
          {/* Backdrop closes on tap */}
          <Pressable style={StyleSheet.absoluteFill} onPress={closePreview} />

          <Animated.View style={[{ flex: 1 }, { transform: [{ translateY }] }]} {...panResponder.panHandlers}>
            {/* Close button — manual inset so it clears the status bar */}
            <View style={[styles.previewTopBar, { paddingTop: insets.top + 4 }]}>
              <Pressable onPress={closePreview} style={styles.previewIconBtn}>
                <X size={22} color="#fff" />
              </Pressable>
            </View>

            {/* Full image */}
            <Image source={{ uri }} style={styles.previewImage} resizeMode="contain" />

            {/* Download button */}
            <View style={[styles.previewBottomBar, { paddingBottom: Math.max(insets.bottom, 16) }]}>
              <Pressable onPress={saveImage} style={styles.previewIconBtn}>
                <Download size={26} color="#fff" />
              </Pressable>
            </View>
          </Animated.View>
        </View>
      </Modal>
    </>
  )
}

// ─── Message ─────────────────────────────────────────────────────────────────

interface Props {
  message: MessageType
  isStreaming?: boolean
  isLast?: boolean
  onRetry?: () => void
}

export function Message({ message, isStreaming = false, isLast = false, onRetry }: Props): JSX.Element {
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

  const handleLongPress = useCallback(() => {
    const textContent = message.blocks
      .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
      .map(b => b.text)
      .join('\n\n')
    if (!textContent) return

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ['Cancel', 'Copy message'], cancelButtonIndex: 0 },
        (index) => { if (index === 1) Clipboard.setStringAsync(textContent) }
      )
    } else {
      Clipboard.setStringAsync(textContent)
    }
  }, [message.blocks])

  return (
    <Pressable
      onLongPress={handleLongPress}
      delayLongPress={400}
      style={[
        styles.messageRow,
        {
          backgroundColor: isUser ? `${colors.surface}80` : 'transparent',
          borderBottomColor: colors.border,
          borderBottomWidth: isLast && !isUser ? 0 : StyleSheet.hairlineWidth
        }
      ]}
    >
      <Text style={[styles.label, { color: colors.muted }]}>{label}</Text>

      {items.map((item, i) => {
        if (item.kind === 'text') {
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
            <ImageBlock key={i} uri={uri} data={item.block.data} mediaType={item.block.mediaType} />
          )
        }
        return (
          <ActivityLog key="activity" blocks={item.blocks} isStreaming={isStreaming} />
        )
      })}

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

      {message.blocks.length === 0 && isStreaming && (
        <View style={styles.thinkingRow}>
          <View style={[styles.pulseDot, { backgroundColor: colors.accent }]} />
          <Text style={{ color: colors.muted, fontSize: 12 }}>Thinking...</Text>
        </View>
      )}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  messageRow: {
    paddingHorizontal: 16,
    paddingVertical: 12
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
  },
  // Image preview modal
  previewOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.96)',
    justifyContent: 'space-between'
  },
  previewTopBar: {
    alignItems: 'flex-end',
    paddingHorizontal: 8
  },
  previewBottomBar: {
    alignItems: 'center',
    paddingVertical: 8
  },
  previewIconBtn: {
    padding: 10
  },
  previewImage: {
    flex: 1,
    width: '100%'
  }
})
