import { Box, Settings, ArrowLeft } from 'lucide-react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useDataStore } from '../../store/data.store'

export function TopNavigation() {
  const { spaces, sessionsBySpaceId, currentSpaceId, currentSessionId } = useDataStore()
  const navigate = useNavigate()
  const location = useLocation()

  const isHomePage = location.pathname === '/'
  const handleBack = () => {
    if (window.history.length > 1) {
      navigate(-1)
    } else {
      navigate('/')
    }
  }

  return (
    <div className="h-12 ui-bg-panel border-b ui-border flex items-center px-4 gap-4 select-none">
      {!isHomePage && (
        <button
          type="button"
          data-testid="back-button"
          onClick={handleBack}
          className="flex items-center gap-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition rounded-lg px-2 py-1 hover:bg-[var(--bg-tertiary)] mr-2"
        >
          <ArrowLeft className="h-4 w-4" />
          <span className="text-sm">返回</span>
        </button>
      )}
      <button
        type="button"
        className="flex items-center gap-2 text-[var(--text-primary)] font-semibold mr-4 cursor-pointer hover:opacity-80 transition-opacity bg-transparent border-none p-0"
        onClick={() => navigate('/')}
      >
        <Box className="w-5 h-5 text-indigo-500" />
        <span>CodeAll</span>
        {currentSpaceId && (
          <span className="ml-2 text-xs font-normal text-[var(--text-muted)]">
            / {spaces.find(s => s.id === currentSpaceId)?.name ?? 'Space'}
            {' '}
            /{' '}
            {currentSessionId
              ? (
                  (sessionsBySpaceId[currentSpaceId] ?? []).find(s => s.id === currentSessionId)
                    ?.title || '未命名对话'
                ).trim()
              : '未选择对话'}
          </span>
        )}
      </button>

      <div className="flex-1" />

      <div className="flex items-center gap-2 ml-auto">
        <button
          type="button"
          onClick={() => navigate('/settings')}
          className="p-1.5 rounded-md text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors"
          title="Settings"
        >
          <Settings className="w-4 h-4" />
        </button>
        <div className="w-8 h-8 rounded-full bg-[var(--bg-tertiary)] flex items-center justify-center text-xs text-[var(--text-secondary)]">
          U
        </div>
      </div>
    </div>
  )
}
