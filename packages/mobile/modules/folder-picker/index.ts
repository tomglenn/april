import { requireNativeModule } from 'expo-modules-core'

export interface FolderPickResult {
  uri: string
  bookmark: string
}

export interface BookmarkResolveResult {
  uri: string
  bookmark: string
  stale: boolean
}

interface NativeFolderPickerModule {
  pickFolder(): Promise<FolderPickResult | null>
  resolveBookmark(bookmark: string): Promise<BookmarkResolveResult>
  releaseBookmark(uri: string): Promise<void>
  readFile(uri: string): Promise<string | null>
  writeFile(uri: string, content: string): Promise<void>
  createDirectory(uri: string): Promise<void>
  deleteFile(uri: string): Promise<void>
  listJsonFiles(uri: string): Promise<string[]>
}

export const FolderPickerModule = requireNativeModule<NativeFolderPickerModule>('FolderPicker')
