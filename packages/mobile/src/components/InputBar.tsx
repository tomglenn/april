import React, { useState, useRef, useCallback } from 'react'
import {
  View,
  Text,
  TextInput,
  Pressable,
  Image,
  StyleSheet,
  NativeSyntheticEvent,
  TextInputContentSizeChangeEventData
} from 'react-native'
import { Send, Square, AlertCircle, Paperclip, Mic, X, Loader } from 'lucide-react-native'
import * as ImagePicker from 'expo-image-picker'
import * as Haptics from 'expo-haptics'
import { useTheme } from '../theme/ThemeProvider'
import type { ImageAttachment } from '@april/core'

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

interface Props {
  onSend: (text: string, images?: ImageAttachment[]) => void
  onStop: () => void
  isStreaming: boolean
  model: string
  provider: string
  missingKey?: boolean
  hasOpenAIKey?: boolean
  isRecording?: boolean
  isTranscribing?: boolean
  recordingSeconds?: number
  onMicPress?: () => void
}

export function InputBar({
  onSend, onStop, isStreaming, model, missingKey,
  hasOpenAIKey, isRecording, isTranscribing, recordingSeconds, onMicPress
}: Props): JSX.Element {
  const colors = useTheme()
  const [text, setText] = useState('')
  const [inputHeight, setInputHeight] = useState(36)
  const [images, setImages] = useState<ImageAttachment[]>([])
  const inputRef = useRef<TextInput>(null)

  const handleSend = useCallback(() => {
    const trimmed = text.trim()
    if ((!trimmed && images.length === 0) || isStreaming || !model || missingKey) return
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    onSend(trimmed, images.length > 0 ? images : undefined)
    setText('')
    setImages([])
    setInputHeight(36)
  }, [text, images, isStreaming, model, missingKey, onSend])

  const handleContentSizeChange = useCallback(
    (e: NativeSyntheticEvent<TextInputContentSizeChangeEventData>) => {
      const h = Math.min(Math.max(e.nativeEvent.contentSize.height, 36), 120)
      setInputHeight(h)
    },
    []
  )

  const pickImage = useCallback(async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.85,
      base64: true,
      allowsMultipleSelection: true
    })
    if (result.canceled || !result.assets) return

    const attachments: ImageAttachment[] = result.assets
      .filter((a) => a.base64)
      .map((a) => ({
        id: generateUUID(),
        dataUrl: `data:image/jpeg;base64,${a.base64}`,
        mediaType: 'image/jpeg'
      }))
    setImages((prev) => [...prev, ...attachments])
  }, [])

  const removeImage = useCallback((id: string) => {
    setImages((prev) => prev.filter((img) => img.id !== id))
  }, [])

  const canSend = (text.trim().length > 0 || images.length > 0) && !isStreaming && !!model && !missingKey

  return (
    <View style={[styles.container, { borderTopColor: colors.border, backgroundColor: colors.surface }]}>
      {/* Recording indicator */}
      {isRecording && (
        <View style={styles.recordingRow}>
          <View style={[styles.recordDot, { backgroundColor: '#ef4444' }]} />
          <Text style={{ color: '#ef4444', fontSize: 12 }}>{recordingSeconds ?? 0}s Recording...</Text>
        </View>
      )}

      {/* Image preview strip */}
      {images.length > 0 && (
        <View style={styles.imageStrip}>
          {images.map((img) => (
            <View key={img.id} style={styles.thumbWrap}>
              <Image
                source={{ uri: img.dataUrl }}
                style={[styles.thumb, { borderColor: colors.border }]}
              />
              <Pressable
                onPress={() => removeImage(img.id)}
                style={[styles.thumbRemove, { backgroundColor: colors.surface, borderColor: colors.border }]}
              >
                <X size={8} color={colors.muted} />
              </Pressable>
            </View>
          ))}
        </View>
      )}

      <View style={[styles.inputRow, { backgroundColor: colors.bg, borderColor: colors.border }]}>
        <TextInput
          ref={inputRef}
          value={text}
          onChangeText={setText}
          placeholder={missingKey ? 'API key required — check Settings' : 'Ask anything…'}
          placeholderTextColor={colors.muted}
          multiline
          style={[styles.input, { color: colors.text, height: inputHeight }]}
          onContentSizeChange={handleContentSizeChange}
          editable={!missingKey}
        />

        <View style={styles.buttons}>
          {/* Attach image */}
          <Pressable onPress={pickImage} style={styles.iconBtn}>
            <Paperclip size={14} color={colors.muted} />
          </Pressable>

          {/* Voice button */}
          {hasOpenAIKey && !isStreaming && onMicPress && (
            <Pressable
              onPress={onMicPress}
              disabled={isTranscribing}
              style={[styles.iconBtn, { opacity: isTranscribing ? 0.4 : 1 }]}
            >
              {isTranscribing ? (
                <Loader size={14} color={colors.muted} />
              ) : (
                <Mic size={14} color={isRecording ? '#ef4444' : colors.muted} />
              )}
            </Pressable>
          )}

          {/* Send / Stop */}
          {isStreaming ? (
            <Pressable onPress={onStop} style={[styles.btn, { backgroundColor: colors.surface }]}>
              <Square size={14} color={colors.text} />
            </Pressable>
          ) : (
            <Pressable
              onPress={handleSend}
              disabled={!canSend}
              style={[
                styles.btn,
                { backgroundColor: canSend ? colors.accent : colors.surface, opacity: canSend ? 1 : 0.4 }
              ]}
            >
              {missingKey ? (
                <AlertCircle size={14} color={canSend ? '#fff' : colors.muted} />
              ) : (
                <Send size={14} color={canSend ? '#fff' : colors.muted} />
              )}
            </Pressable>
          )}
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: 1
  },
  recordingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 4,
    paddingBottom: 6
  },
  recordDot: {
    width: 8,
    height: 8,
    borderRadius: 4
  },
  imageStrip: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingBottom: 8
  },
  thumbWrap: {
    position: 'relative'
  },
  thumb: {
    width: 56,
    height: 56,
    borderRadius: 8,
    borderWidth: 1
  },
  thumbRemove: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center'
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
    gap: 6
  },
  input: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    paddingVertical: 6,
    paddingHorizontal: 4
  },
  buttons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingBottom: 4
  },
  iconBtn: {
    padding: 8
  },
  btn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center'
  }
})
