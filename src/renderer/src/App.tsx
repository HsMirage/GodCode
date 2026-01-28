import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { ChatPage } from './pages/ChatPage'
import { SettingsPage } from './pages/SettingsPage'

export function App() {
  return (
    <BrowserRouter>
      <div className='min-h-screen bg-slate-950 text-slate-100'>
        <Routes>
          <Route path='/' element={<ChatPage />} />
          <Route path='/settings' element={<SettingsPage />} />
        </Routes>
      </div>
    </BrowserRouter>
  )
}
