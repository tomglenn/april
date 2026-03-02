import OpenAI, { toFile } from 'openai'

export async function transcribeAudio(apiKey: string, audioBuffer: ArrayBuffer): Promise<string> {
  const openai = new OpenAI({ apiKey })
  const file = await toFile(Buffer.from(audioBuffer), 'recording.webm', {
    type: 'audio/webm'
  })
  const result = await openai.audio.transcriptions.create({
    model: 'whisper-1',
    file
  })
  return result.text
}

export async function synthesizeSpeech(
  apiKey: string,
  text: string,
  voiceModel?: string,
  voiceVoice?: string
): Promise<ArrayBuffer> {
  const openai = new OpenAI({ apiKey })
  const truncated = text.slice(0, 4096)

  const response = await openai.audio.speech.create({
    model: voiceModel || 'tts-1',
    voice: (voiceVoice || 'nova') as 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer',
    input: truncated,
    response_format: 'mp3'
  })

  return await response.arrayBuffer()
}
