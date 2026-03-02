import { ipcMain } from 'electron'
import { localStore, getSyncedSettings } from '../store'
import { transcribeAudio, synthesizeSpeech } from '@april/core'

export function registerVoiceHandlers(): void {
  ipcMain.handle('voice:transcribe', async (_event, audioBuffer: ArrayBuffer) => {
    const apiKey = localStore.get('openaiApiKey')
    if (!apiKey) throw new Error('No OpenAI API key configured')
    return transcribeAudio(apiKey, audioBuffer)
  })

  ipcMain.handle('voice:synthesize', async (_event, text: string) => {
    const apiKey = localStore.get('openaiApiKey')
    if (!apiKey) throw new Error('No OpenAI API key configured')
    const synced = getSyncedSettings()
    return synthesizeSpeech(apiKey, text, synced.voiceModel, synced.voiceVoice)
  })
}
