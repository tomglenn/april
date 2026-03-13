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
    bg: '#0d0d0f',
    surface: '#16161a',
    surfaceAlt: '#1e1e24',
    border: '#2a2a35',
    text: '#e8e8f0',
    muted: '#666680',
    accent: '#3b82f6',
    error: '#ef4444'
  },
  light: {
    bg: '#f5f5f7',
    surface: '#ffffff',
    surfaceAlt: '#f0f0f4',
    border: '#e2e2e8',
    text: '#1a1a2e',
    muted: '#888899',
    accent: '#3b82f6',
    error: '#ef4444'
  }
}
