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
    <div className="h-12 bg-slate-950 border-b border-slate-800 flex items-center px-4 gap-4 select-none">
      {!isHomePage && (
        <button
          type="button"
          data-testid="back-button"
          onClick={handleBack}
          className="flex items-center gap-2 text-slate-400 hover:text-white transition rounded-lg px-2 py-1 hover:bg-slate-800/50 mr-2"
        >
          <ArrowLeft className="h-4 w-4" />
          <span className="text-sm">返回</span>
        </button>
      )}
      <button
        type="button"
        className="flex items-center gap-2 text-slate-100 font-semibold mr-4 cursor-pointer hover:opacity-80 transition-opacity bg-transparent border-none p-0"
        onClick={() => navigate('/')}
      >
        <Box className="w-5 h-5 text-indigo-500" />
        <span>CodeAll</span>
        {currentSpaceId && (
          <span className="ml-2 text-xs font-normal text-slate-500">
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
          className="p-1.5 rounded-md text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
          title="Settings"
        >
          <Settings className="w-4 h-4" />
        </button>
        <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-xs text-slate-400">
          U
        </div>
      </div>
    </div>
  )
}
