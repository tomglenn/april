// Polyfill crypto.randomUUID for React Native (used by @april/core)
if (typeof globalThis.crypto === 'undefined') {
  globalThis.crypto = {} as Crypto
}
if (typeof globalThis.crypto.randomUUID !== 'function') {
  globalThis.crypto.randomUUID = () =>
    'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
    }) as `${string}-${string}-${string}-${string}-${string}`
}

import React, { useEffect, useRef, useState } from 'react'
import { AppState, View, ActivityIndicator, LogBox } from 'react-native'

LogBox.ignoreLogs(['InteractionManager has been deprecated'])
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { Drawer } from 'expo-router/drawer'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import { initializePlatform } from '../src/platform'
import { useSettingsStore } from '../src/stores/settings'
import { useConversationsStore } from '../src/stores/conversations'
import { ThemeProvider, useTheme } from '../src/theme/ThemeProvider'
import { SetupWizard } from '../src/components/SetupWizard'
import { DrawerContent } from '../src/components/DrawerContent'

function AppContent(): JSX.Element {
  const [ready, setReady] = useState(false)
  const { settings, load: loadSettings, reload: reloadSettings } = useSettingsStore()
  const { load: loadConversations } = useConversationsStore()
  const colors = useTheme()

  const appState = useRef(AppState.currentState)

  useEffect(() => {
    async function init() {
      await initializePlatform()
      loadSettings()
      await loadConversations()
      setReady(true)
    }
    init()
  }, [])

  // Poll for file system changes every 15s when foregrounded — picks up edits from desktop
  useEffect(() => {
    const POLL_MS = 15_000
    let timer: ReturnType<typeof setInterval> | null = null

    const poll = (): void => { reloadSettings(); loadConversations() }

    const startPolling = (): void => {
      if (timer) return
      timer = setInterval(poll, POLL_MS)
    }
    const stopPolling = (): void => {
      if (timer) { clearInterval(timer); timer = null }
    }

    startPolling()
    const sub = AppState.addEventListener('change', (next) => {
      if (appState.current !== 'active' && next === 'active') {
        poll() // immediate refresh on foreground
        startPolling()
      } else if (next === 'background' || next === 'inactive') {
        stopPolling()
      }
      appState.current = next
    })

    return () => { stopPolling(); sub.remove() }
  }, [])

  if (!ready || !settings) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bg }}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    )
  }

  if (!settings.setupCompleted) {
    return <SetupWizard />
  }

  return (
    <Drawer
      drawerContent={DrawerContent}
      screenOptions={{
        headerShown: false,
        drawerType: 'slide',
        drawerStyle: {
          backgroundColor: colors.surface,
          width: 300
        }
      }}
    >
      <Drawer.Screen name="index" />
      <Drawer.Screen name="settings" options={{ title: 'Settings' }} />
    </Drawer>
  )
}

export default function RootLayout(): JSX.Element {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <StatusBar style="auto" />
          <AppContent />
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}
