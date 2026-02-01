import { HashRouter, Routes, Route } from 'react-router-dom'
import { MainLayout } from './components/layout/MainLayout'
import { SettingsPage } from './pages/SettingsPage'
import { ErrorBoundary } from './components/ErrorBoundary'

export function App() {
  return (
    <ErrorBoundary>
      <HashRouter>
        <Routes>
          <Route path="/" element={<MainLayout />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </HashRouter>
    </ErrorBoundary>
  )
}
