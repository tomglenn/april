export interface ThemeColors {
  bg: string
  surface: string
  surfaceAlt: string
  border: string
  text: string
  muted: string
  accent: string
  error: string
}

export const themes: Record<'dark' | 'light', ThemeColors> = {
  dark: {
    bg: '#0f0f10',
    surface: '#1a1a1e',
    surfaceAlt: '#222226',
    border: '#2a2a2e',
    text: '#e4e4e7',
    muted: '#71717a',
    accent: '#6366f1',
    error: '#ef4444'
  },
  light: {
    bg: '#ffffff',
    surface: '#f4f4f5',
    surfaceAlt: '#e4e4e7',
    border: '#d4d4d8',
    text: '#18181b',
    muted: '#71717a',
    accent: '#6366f1',
    error: '#ef4444'
  }
}
