import { FolderPickerModule } from '../../modules/folder-picker'
import type { FolderPickResult } from '../../modules/folder-picker'

export type { FolderPickResult }

export async function pickFolder(): Promise<FolderPickResult | null> {
  return FolderPickerModule.pickFolder()
}
