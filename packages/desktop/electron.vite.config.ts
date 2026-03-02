import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: ['@anthropic-ai/sdk', 'openai', '@april/core'] })],
    resolve: {
      alias: {
        '@april/core': resolve('../core/src')
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@april/core': resolve('../core/src')
      }
    }
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        '@april/core': resolve('../core/src/browser')
      }
    },
    plugins: [react()]
  }
})
