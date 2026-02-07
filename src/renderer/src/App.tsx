import { useEffect } from 'react'
import { HashRouter, Routes, Route } from 'react-router-dom'
import { MainLayout } from './components/layout/MainLayout'
import { SettingsLayout } from './components/layout/SettingsLayout'
import { ErrorBoundary } from './components/ErrorBoundary'
import { useDataStore } from './store/data.store'

export function App() {
  const fetchSpaces = useDataStore(s => s.fetchSpaces)

  // Keep the authoritative space list in sync with persisted selections.
  useEffect(() => {
    void fetchSpaces()
  }, [fetchSpaces])

  return (
    <ErrorBoundary>
      <HashRouter>
        <Routes>
          <Route path="/" element={<MainLayout />} />
          <Route path="/settings" element={<SettingsLayout />} />
        </Routes>
      </HashRouter>
    </ErrorBoundary>
  )
}
