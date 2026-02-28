import { registerConversationHandlers } from './conversations'
import { registerSettingsHandlers } from './settings'
import { registerProviderHandlers } from './providers'
import { registerChatHandlers } from './chat'

export function registerAllHandlers(): void {
  registerConversationHandlers()
  registerSettingsHandlers()
  registerProviderHandlers()
  registerChatHandlers()
}
