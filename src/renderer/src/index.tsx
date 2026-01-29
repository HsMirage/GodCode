import { createRoot } from 'react-dom/client'
import React from 'react'
import './index.css'
import { App } from './App'

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
