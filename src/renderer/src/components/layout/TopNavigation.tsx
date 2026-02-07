import { Box, Settings, ArrowLeft } from 'lucide-react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useDataStore } from '../../store/data.store'

export function TopNavigation() {
  const { spaces, currentSpaceId } = useDataStore()
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
          </span>
        )}
      </button>

      <div className="flex-1" />

      <div className="flex items-center gap-2 ml-auto">
        <div
          className="hidden md:flex items-center gap-2 text-[11px] text-slate-600"
          title={window.location.href}
        >
          <span
            className={[
              'px-2 py-1 rounded-full border',
              import.meta.env.DEV
                ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400'
                : 'border-slate-700/60 bg-slate-900/40 text-slate-500'
            ].join(' ')}
          >
            {import.meta.env.DEV ? 'DEV' : 'PROD'}
          </span>
          <span className="font-mono">{window.location.protocol.replace(':', '')}</span>
        </div>
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
