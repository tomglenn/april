import * as FileSystem from 'expo-file-system/legacy'

// Images are stored in the app sandbox regardless of the user's chosen data
// folder. This avoids needing the native FolderPickerModule to handle binary
// writes. The trade-off is that images don't sync via iCloud, but the
// conversation JSON (which does sync) references them by fileUri and falls
// back to rendering nothing if the file isn't present on another device.
const IMAGES_DIR = (FileSystem.documentDirectory ?? '') + 'april-data/images/'

async function ensureImagesDir(): Promise<void> {
  const info = await FileSystem.getInfoAsync(IMAGES_DIR)
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(IMAGES_DIR, { intermediates: true })
  }
}

function makeId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2)
}

/** Write base64 image data to a file and return the local file URI. */
export async function saveImageToFile(base64Data: string, mediaType: string): Promise<string> {
  await ensureImagesDir()
  const ext = mediaType === 'image/png' ? '.png' : mediaType === 'image/webp' ? '.webp' : '.jpg'
  const fileUri = IMAGES_DIR + makeId() + ext
  await FileSystem.writeAsStringAsync(fileUri, base64Data, {
    encoding: FileSystem.EncodingType.Base64
  })
  return fileUri
}

/** Read a stored image file back as base64. */
export async function readImageAsBase64(fileUri: string): Promise<string> {
  return FileSystem.readAsStringAsync(fileUri, { encoding: FileSystem.EncodingType.Base64 })
}

/** Delete an image file, silently ignoring missing-file errors. */
export async function deleteImageFile(fileUri: string): Promise<void> {
  try {
    await FileSystem.deleteAsync(fileUri, { idempotent: true })
  } catch { /* ignore */ }
}
