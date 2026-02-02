import { useEffect } from 'react'
import { useUpdaterStore } from '../../store/updater.store'
import { UpdateDialog } from './UpdateDialog'
import { UpdateToast } from './UpdateToast'

export function UpdaterManager() {
  const { setStatus, setUpdateInfo, setProgress, setError } = useUpdaterStore()

  useEffect(() => {
    // Listen for updater events
    const unsubChecking = window.codeall.on('updater:checking-for-update', () => {
      setStatus('checking')
    })

    const unsubAvailable = window.codeall.on('updater:update-available', info => {
      setStatus('available')
      setUpdateInfo(info)
    })

    const unsubNotAvailable = window.codeall.on('updater:update-not-available', () => {
      setStatus('not-available')
    })

    const unsubError = window.codeall.on('updater:error', err => {
      setStatus('error')
      setError(err)
    })

    const unsubProgress = window.codeall.on('updater:download-progress', progress => {
      setStatus('downloading')
      setProgress(progress)
    })

    const unsubDownloaded = window.codeall.on('updater:update-downloaded', info => {
      setStatus('downloaded')
      setUpdateInfo(info)
    })

    // Initial check (optional, main process does it on start)
    // window.codeall.invoke('updater:check-for-updates')

    return () => {
      unsubChecking()
      unsubAvailable()
      unsubNotAvailable()
      unsubError()
      unsubProgress()
      unsubDownloaded()
    }
  }, [setStatus, setUpdateInfo, setProgress, setError])

  return (
    <>
      <UpdateDialog />
      <UpdateToast />
    </>
  )
}
