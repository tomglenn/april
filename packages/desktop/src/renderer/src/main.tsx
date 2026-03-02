import './styles/globals.css'
import 'highlight.js/styles/github-dark.css'
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { OverlayApp } from './OverlayApp'

const isOverlay = window.location.search.includes('overlay=true')

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    {isOverlay ? <OverlayApp /> : <App />}
  </React.StrictMode>
)
