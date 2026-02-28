import { useEffect, useState } from 'react'
import { Sidebar } from './components/Sidebar'
import { ConversationView } from './components/ConversationView'
import { SettingsModal } from './components/SettingsModal'
import { SetupWizard } from './components/SetupWizard'
import { useConversationsStore } from './stores/conversations'
import { useSettingsStore } from './stores/settings'

export default function App(): JSX.Element {
  const { load: loadConversations, createNew } = useConversationsStore()
  const { load: loadSettings, settings } = useSettingsStore()
  const [showSettings, setShowSettings] = useState(false)

  useEffect(() => {
    loadSettings()
    loadConversations()
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      const mod = e.metaKey || e.ctrlKey
      if (!mod) return
      if (e.key === 'n') { e.preventDefault(); createNew() }
      if (e.key === ',') { e.preventDefault(); setShowSettings(true) }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [createNew])

  const showWizard = settings !== null && !settings.setupCompleted

  return (
    <div className="flex h-full overflow-hidden" style={{ background: 'var(--bg)' }}>
      <Sidebar onOpenSettings={() => setShowSettings(true)} />
      <ConversationView />
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
      {showWizard && <SetupWizard />}
    </div>
  )
}
