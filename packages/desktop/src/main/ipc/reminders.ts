import { ipcMain } from 'electron'
import { getReminders, cancelReminder } from '@april/core'

export function registerReminderHandlers(): void {
  ipcMain.handle('reminders:list', () => {
    return getReminders()
  })

  ipcMain.handle('reminders:cancel', (_event, id: string) => {
    return cancelReminder(id)
  })
}
