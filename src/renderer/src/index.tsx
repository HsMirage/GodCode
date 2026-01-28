import { createRoot } from 'react-dom/client'
import React from 'react'
import './index.css'

function App() {
  return (
    <div>
      <h1>CodeAll</h1>
      <p>Multi-LLM Collaborative Programming Platform</p>
    </div>
  )
}

const root = document.getElementById('root')
if (root) {
  createRoot(root).render(<App />)
}
