import { useEffect, useState } from 'react'
import { Sidebar } from './components/Sidebar'
import { ConversationView } from './components/ConversationView'
import { SettingsModal } from './components/SettingsModal'
import { useConversationsStore } from './stores/conversations'
import { useSettingsStore } from './stores/settings'

export default function App(): JSX.Element {
  const { load: loadConversations } = useConversationsStore()
  const { load: loadSettings } = useSettingsStore()
  const [showSettings, setShowSettings] = useState(false)

  useEffect(() => {
    loadSettings()
    loadConversations()
  }, [])

  return (
    <div className="flex h-full overflow-hidden" style={{ background: 'var(--bg)' }}>
      <Sidebar onOpenSettings={() => setShowSettings(true)} />
      <ConversationView />
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </div>
  )
}
