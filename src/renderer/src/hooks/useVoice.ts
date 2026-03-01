import { useState, useRef, useCallback, useEffect } from 'react'

export interface SpeakingState {
  id: string
  phase: 'generating' | 'playing'
}

export interface VoiceState {
  isRecording: boolean
  isTranscribing: boolean
  recordingSeconds: number
  speakingState: SpeakingState | null
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
  const [speakingState, setSpeakingState] = useState<SpeakingState | null>(null)

  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const sourceRef = useRef<AudioBufferSourceNode | null>(null)
  const requestIdRef = useRef(0)

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
    requestIdRef.current++
    if (sourceRef.current) {
      try { sourceRef.current.stop() } catch { /* already stopped */ }
      sourceRef.current = null
    }
    setSpeakingState(null)
  }, [])

  const speak = useCallback((messageId: string, text: string) => {
    // Stop any in-flight request or playback
    if (sourceRef.current) {
      try { sourceRef.current.stop() } catch { /* already stopped */ }
      sourceRef.current = null
    }
    const myRequestId = ++requestIdRef.current
    setSpeakingState({ id: messageId, phase: 'generating' })

    window.api.synthesizeSpeech(text).then(async (arrayBuffer) => {
      if (requestIdRef.current !== myRequestId) return
      const ctx = getAudioContext()
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer)
      if (requestIdRef.current !== myRequestId) return
      const source = ctx.createBufferSource()
      source.buffer = audioBuffer
      source.connect(ctx.destination)
      source.onended = () => {
        if (requestIdRef.current === myRequestId) {
          sourceRef.current = null
          setSpeakingState(null)
        }
      }
      sourceRef.current = source
      setSpeakingState({ id: messageId, phase: 'playing' })
      source.start()
    }).catch(() => {
      if (requestIdRef.current === myRequestId) {
        setSpeakingState(null)
      }
    })
  }, [getAudioContext])

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
    speakingState,
    startRecording,
    stopRecording,
    cancelRecording,
    speak,
    stopSpeaking
  }
}
