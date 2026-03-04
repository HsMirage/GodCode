import { Dialog } from '@headlessui/react'
import { X, Download, RotateCcw } from 'lucide-react'
import { useUpdaterStore } from '../../store/updater.store'

export function UpdateDialog() {
  const { status, updateInfo, progress, setStatus } = useUpdaterStore()

  const isOpen = status === 'available' || status === 'downloading' || status === 'downloaded'

  const handleDownload = () => {
    window.codeall?.invoke('updater:download-update')
    setStatus('downloading')
  }

  const handleInstall = () => {
    window.codeall?.invoke('updater:quit-and-install')
  }

  const handleClose = () => {
    // If downloading, we can't easily cancel, but we can hide the dialog
    // Ideally we should have a "minimize" or "hide" option
    // For now, if downloading, we prevent closing or show warning
    // But since it's a modal, user might want to hide it
    // Let's allow closing only if not mandatory (which isn't implemented)
    // Here we just hide the dialog by resetting status? No, that stops the flow logic visually
    // Better to have a separate 'dialogOpen' state or just close it and show Toast
    // For MVP, we allow closing if available (Later) or downloaded (Install later)
    if (status === 'downloading') {
      // Allow hiding, progress continues in background (and toast should show)
    }
    // We don't reset status because process is ongoing
    // But this dialog relies on status to show.
    // If we want to hide it, we need a separate "showDialog" state.
    // Since we don't have it, "Close" = "Later"
    setStatus('idle')
  }

  if (!isOpen || !updateInfo) return null

  return (
    <Dialog open={isOpen} onClose={() => {}} className="relative z-50">
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" aria-hidden="true" />

      <div className="fixed inset-0 flex items-center justify-center p-4">
        <Dialog.Panel className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-xl">
          <div className="flex items-center justify-between">
            <Dialog.Title className="text-lg font-medium text-white">
              {status === 'downloaded' ? 'Update Ready' : 'Update Available'}
            </Dialog.Title>
            {status !== 'downloading' && (
              <button onClick={handleClose} className="text-slate-400 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            )}
          </div>

          <div className="mt-4">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-500/20 text-blue-400">
                <RotateCcw className="h-6 w-6" />
              </div>
              <div>
                <p className="font-medium text-white">CodeAll v{updateInfo.version}</p>
                <p className="text-sm text-slate-400">
                  {status === 'downloaded'
                    ? 'New version is downloaded and ready to install.'
                    : 'A new version is available for download.'}
                </p>
              </div>
            </div>

            {/* Release Notes */}
            {updateInfo.releaseNotes && (
              <div className="mt-4 max-h-40 overflow-y-auto rounded-lg bg-slate-950 p-3 text-sm text-slate-300">
                <p className="mb-1 font-semibold text-slate-200">Release Notes:</p>
                <div
                  dangerouslySetInnerHTML={{
                    __html:
                      typeof updateInfo.releaseNotes === 'string'
                        ? updateInfo.releaseNotes
                        : JSON.stringify(updateInfo.releaseNotes)
                  }}
                />
              </div>
            )}

            {/* Progress Bar */}
            {status === 'downloading' && progress && (
              <div className="mt-4 space-y-2">
                <div className="flex justify-between text-xs text-slate-400">
                  <span>Downloading...</span>
                  <span>{Math.round(progress.percent)}%</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
                  <div
                    className="h-full bg-blue-500 transition-all duration-300"
                    style={{ width: `${progress.percent}%` }}
                  />
                </div>
                <div className="text-right text-xs text-slate-500">
                  {(progress.bytesPerSecond / 1024 / 1024).toFixed(1)} MB/s
                </div>
              </div>
            )}
          </div>

          <div className="mt-6 flex justify-end gap-3">
            {status === 'available' && (
              <>
                <button
                  onClick={handleClose}
                  className="rounded-lg px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800 hover:text-white"
                >
                  Later
                </button>
                <button
                  onClick={handleDownload}
                  className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500"
                >
                  <Download className="h-4 w-4" />
                  Download Update
                </button>
              </>
            )}

            {status === 'downloading' && (
              <button
                disabled
                className="flex items-center gap-2 rounded-lg bg-slate-700 px-4 py-2 text-sm font-medium text-slate-400 cursor-not-allowed"
              >
                <Download className="h-4 w-4 animate-bounce" />
                Downloading...
              </button>
            )}

            {status === 'downloaded' && (
              <>
                <button
                  onClick={handleClose}
                  className="rounded-lg px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800 hover:text-white"
                >
                  Install Later
                </button>
                <button
                  onClick={handleInstall}
                  className="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-500"
                >
                  <RotateCcw className="h-4 w-4" />
                  Restart & Install
                </button>
              </>
            )}
          </div>
        </Dialog.Panel>
      </div>
    </Dialog>
  )
}
