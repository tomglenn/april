import { useState, useRef, useCallback } from 'react'
import { useSettingsStore } from '../stores/settings'

interface UseVoiceReturn {
  isRecording: boolean
  isTranscribing: boolean
  recordingSeconds: number
  startRecording: () => Promise<void>
  stopRecording: () => Promise<string | null>
  speak: (text: string) => Promise<void>
  stopSpeaking: () => void
  isSpeaking: boolean
}

export function useVoice(): UseVoiceReturn {
  const [isRecording, setIsRecording] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [recordingSeconds, setRecordingSeconds] = useState(0)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recorderRef = useRef<any>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ttsPlayerRef = useRef<any>(null)

  const startRecording = useCallback(async () => {
    try {
      const ExpoAudio = await import('expo-audio')
      const { granted } = await ExpoAudio.requestRecordingPermissionsAsync()
      if (!granted) return

      await ExpoAudio.setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true })

      const recorder = new ExpoAudio.AudioRecorder(ExpoAudio.RecordingPresets.HIGH_QUALITY)
      recorderRef.current = recorder
      await recorder.prepareToRecordAsync()
      recorder.record()

      setIsRecording(true)
      setRecordingSeconds(0)
      timerRef.current = setInterval(() => setRecordingSeconds((s) => s + 1), 1000)
    } catch (err) {
      console.warn('[voice] Failed to start recording:', err)
      setIsRecording(false)
    }
  }, [])

  const stopRecording = useCallback(async (): Promise<string | null> => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    setIsRecording(false)

    const recorder = recorderRef.current
    if (!recorder) return null

    try {
      await recorder.stop()
      const ExpoAudio = await import('expo-audio')
      await ExpoAudio.setAudioModeAsync({ allowsRecording: false })

      const uri = recorder.uri
      recorderRef.current = null
      if (!uri) return null

      setIsTranscribing(true)

      const { settings } = useSettingsStore.getState()
      if (!settings?.openaiApiKey) {
        setIsTranscribing(false)
        return null
      }

      const formData = new FormData()
      formData.append('file', {
        uri,
        type: 'audio/m4a',
        name: 'recording.m4a'
      } as any)
      formData.append('model', 'whisper-1')

      const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${settings.openaiApiKey}` },
        body: formData
      })

      if (!response.ok) {
        setIsTranscribing(false)
        return null
      }

      const data = await response.json()
      setIsTranscribing(false)
      return data.text || null
    } catch (err) {
      console.warn('[voice] Transcription failed:', err)
      setIsTranscribing(false)
      return null
    }
  }, [])

  const speak = useCallback(async (text: string) => {
    const { settings } = useSettingsStore.getState()
    if (!settings?.openaiApiKey) return

    try {
      setIsSpeaking(true)

      const response = await fetch('https://api.openai.com/v1/audio/speech', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${settings.openaiApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: settings.voiceModel || 'tts-1',
          voice: settings.voiceVoice || 'alloy',
          input: text.slice(0, 4096)
        })
      })

      if (!response.ok) {
        setIsSpeaking(false)
        return
      }

      const blob = await response.blob()
      const reader = new FileReader()
      const dataUri = await new Promise<string>((resolve) => {
        reader.onload = () => resolve(reader.result as string)
        reader.readAsDataURL(blob)
      })

      const ExpoAudio = await import('expo-audio')
      const player = new ExpoAudio.AudioPlayer(dataUri, 0.5, false, 0)
      ttsPlayerRef.current = player

      player.addListener('playbackStatusUpdate', (status: any) => {
        if (status.didJustFinish) {
          setIsSpeaking(false)
          player.remove()
          ttsPlayerRef.current = null
        }
      })

      player.play()
    } catch (err) {
      console.warn('[voice] TTS failed:', err)
      setIsSpeaking(false)
    }
  }, [])

  const stopSpeaking = useCallback(() => {
    const player = ttsPlayerRef.current
    if (player) {
      player.pause?.()
      player.remove?.()
      ttsPlayerRef.current = null
    }
    setIsSpeaking(false)
  }, [])

  return {
    isRecording,
    isTranscribing,
    recordingSeconds,
    startRecording,
    stopRecording,
    speak,
    stopSpeaking,
    isSpeaking
  }
}
