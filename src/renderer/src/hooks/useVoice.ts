import { useState, useRef, useCallback, useEffect } from 'react'

export interface VoiceState {
  isRecording: boolean
  isTranscribing: boolean
  recordingSeconds: number
  playingMessageId: string | null
  startRecording: () => void
  stopRecording: () => Promise<string | null>
  cancelRecording: () => void
  speak: (messageId: string, text: string) => void
  stopSpeaking: () => void
}

export function useVoice(): VoiceState {
  const [isRecording, setIsRecording] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [recordingSeconds, setRecordingSeconds] = useState(0)
  const [playingMessageId, setPlayingMessageId] = useState<string | null>(null)

  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const sourceRef = useRef<AudioBufferSourceNode | null>(null)

  const stopMediaTracks = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const startRecording = useCallback(() => {
    chunksRef.current = []
    setRecordingSeconds(0)

    navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
      streamRef.current = stream
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm'
      const recorder = new MediaRecorder(stream, { mimeType })
      recorderRef.current = recorder

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }

      recorder.start(250)
      setIsRecording(true)

      const start = Date.now()
      timerRef.current = setInterval(() => {
        setRecordingSeconds(Math.floor((Date.now() - start) / 1000))
      }, 500)
    })
  }, [])

  const stopRecording = useCallback(async (): Promise<string | null> => {
    const recorder = recorderRef.current
    if (!recorder || recorder.state === 'inactive') {
      stopMediaTracks()
      setIsRecording(false)
      return null
    }

    return new Promise<string | null>((resolve) => {
      recorder.onstop = async () => {
        stopMediaTracks()
        setIsRecording(false)
        setIsTranscribing(true)

        try {
          const blob = new Blob(chunksRef.current, { type: recorder.mimeType })
          const buffer = await blob.arrayBuffer()
          const text = await window.api.transcribeAudio(buffer)
          setIsTranscribing(false)
          resolve(text || null)
        } catch {
          setIsTranscribing(false)
          resolve(null)
        }
      }
      recorder.stop()
    })
  }, [stopMediaTracks])

  const cancelRecording = useCallback(() => {
    const recorder = recorderRef.current
    if (recorder && recorder.state !== 'inactive') {
      recorder.onstop = null
      recorder.stop()
    }
    stopMediaTracks()
    setIsRecording(false)
    chunksRef.current = []
  }, [stopMediaTracks])

  const getAudioContext = useCallback(() => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new AudioContext()
    }
    return audioCtxRef.current
  }, [])

  const stopSpeaking = useCallback(() => {
    if (sourceRef.current) {
      try { sourceRef.current.stop() } catch { /* already stopped */ }
      sourceRef.current = null
    }
    setPlayingMessageId(null)
  }, [])

  const speak = useCallback((messageId: string, text: string) => {
    stopSpeaking()

    window.api.synthesizeSpeech(text).then(async (arrayBuffer) => {
      const ctx = getAudioContext()
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer)
      const source = ctx.createBufferSource()
      source.buffer = audioBuffer
      source.connect(ctx.destination)
      source.onended = () => {
        sourceRef.current = null
        setPlayingMessageId(null)
      }
      sourceRef.current = source
      setPlayingMessageId(messageId)
      source.start()
    }).catch(() => {
      setPlayingMessageId(null)
    })
  }, [stopSpeaking, getAudioContext])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cancelRecording()
      stopSpeaking()
    }
  }, [cancelRecording, stopSpeaking])

  return {
    isRecording,
    isTranscribing,
    recordingSeconds,
    playingMessageId,
    startRecording,
    stopRecording,
    cancelRecording,
    speak,
    stopSpeaking
  }
}
