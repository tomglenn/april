import React, { createContext, useContext, useEffect, useState } from 'react'
import { Appearance } from 'react-native'
import { themes, type ThemeColors } from './index'
import { useSettingsStore } from '../stores/settings'

const ThemeContext = createContext<ThemeColors>(themes.dark)

export function useTheme(): ThemeColors {
  return useContext(ThemeContext)
}

export function ThemeProvider({ children }: { children: React.ReactNode }): JSX.Element {
  const { settings } = useSettingsStore()
  const themeSetting = settings?.theme ?? 'dark'
  const [systemScheme, setSystemScheme] = useState<'dark' | 'light'>(
    Appearance.getColorScheme() === 'light' ? 'light' : 'dark'
  )

  useEffect(() => {
    const sub = Appearance.addChangeListener(({ colorScheme }) => {
      setSystemScheme(colorScheme === 'light' ? 'light' : 'dark')
    })
    return () => sub.remove()
  }, [])

  const resolvedTheme = themeSetting === 'system' ? systemScheme : themeSetting
  const colors = themes[resolvedTheme]

  return (
    <ThemeContext.Provider value={colors}>
      {children}
    </ThemeContext.Provider>
  )
}
