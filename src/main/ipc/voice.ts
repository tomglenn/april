import { ipcMain } from 'electron'
import OpenAI, { toFile } from 'openai'
import { localStore, getSyncedSettings } from '../store'

export function registerVoiceHandlers(): void {
  ipcMain.handle('voice:transcribe', async (_event, audioBuffer: ArrayBuffer) => {
    const apiKey = localStore.get('openaiApiKey')
    if (!apiKey) throw new Error('No OpenAI API key configured')

    const openai = new OpenAI({ apiKey })
    const file = await toFile(Buffer.from(audioBuffer), 'recording.webm', {
      type: 'audio/webm'
    })
    const result = await openai.audio.transcriptions.create({
      model: 'whisper-1',
      file
    })
    return result.text
  })

  ipcMain.handle('voice:synthesize', async (_event, text: string) => {
    const apiKey = localStore.get('openaiApiKey')
    if (!apiKey) throw new Error('No OpenAI API key configured')

    const synced = getSyncedSettings()
    const openai = new OpenAI({ apiKey })
    const truncated = text.slice(0, 4096)

    const response = await openai.audio.speech.create({
      model: synced.voiceModel || 'tts-1',
      voice: (synced.voiceVoice || 'nova') as 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer',
      input: truncated,
      response_format: 'mp3'
    })

    const buffer = await response.arrayBuffer()
    return buffer
  })
}
