import { ipcMain } from 'electron'
import { getReminders, cancelReminder } from '../reminders'

export function registerReminderHandlers(): void {
  ipcMain.handle('reminders:list', () => {
    return getReminders()
  })

  ipcMain.handle('reminders:cancel', (_event, id: string) => {
    return cancelReminder(id)
  })
}
