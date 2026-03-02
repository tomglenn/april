import { ipcMain } from 'electron'
import { getSettings } from '../store'
import { fetchModels } from '@april/core'
import type { Provider } from '@april/core'

export function registerProviderHandlers(): void {
  ipcMain.handle('providers:models', async (_, provider: Provider) => {
    const settings = getSettings()
    return fetchModels(provider, settings.ollamaBaseUrl)
  })
}
