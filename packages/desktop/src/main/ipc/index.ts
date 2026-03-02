import { registerConversationHandlers } from './conversations'
import { registerSettingsHandlers } from './settings'
import { registerProviderHandlers } from './providers'
import { registerChatHandlers } from './chat'
import { registerReminderHandlers } from './reminders'
import { registerVoiceHandlers } from './voice'

export function registerAllHandlers(): void {
  registerConversationHandlers()
  registerSettingsHandlers()
  registerProviderHandlers()
  registerChatHandlers()
  registerReminderHandlers()
  registerVoiceHandlers()
}
