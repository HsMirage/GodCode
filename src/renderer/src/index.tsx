import { createRoot } from 'react-dom/client'
import React from 'react'
import './index.css'
import { App } from './App'

// Initialize theme from localStorage before React renders
const initializeTheme = () => {
  try {
    const stored = localStorage.getItem('codeall-ui-storage')
    if (stored) {
      const parsed = JSON.parse(stored)
      const theme = parsed?.state?.theme || 'dark'
      if (theme === 'light') {
        document.documentElement.classList.add('light')
        document.documentElement.classList.remove('dark')
      } else {
        document.documentElement.classList.add('dark')
        document.documentElement.classList.remove('light')
      }
    } else {
      // Default to dark theme
      document.documentElement.classList.add('dark')
    }
  } catch {
    document.documentElement.classList.add('dark')
  }
}

initializeTheme()

window.addEventListener('error', event => {
  console.error('[Renderer] Error:', event.error)
  event.preventDefault()
})

window.addEventListener('unhandledrejection', event => {
  console.error('[Renderer] Unhandled Rejection:', event.reason)
  event.preventDefault()
})

const root = document.getElementById('root')
if (root) {
  createRoot(root).render(<App />)
}
